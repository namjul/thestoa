#!/usr/bin/env zx

import { decode } from "html-entities";
import hasha from "hasha";
import slugify from "slugify";
import winkNLP from "wink-nlp"; // Load wink-nlp package  & helpers.
import its from "wink-nlp/src/its.js"; // Load "its" helper to extract item properties.
import as from "wink-nlp/src/as.js"; // Load "as" reducer helper to reduce a collection.
import model from "wink-eng-lite-model"; // Load english language model — light version.
import jaro from "wink-jaro-distance";
import { nanoid } from "nanoid";
import dateParser from "any-date-parser";
import today from "any-date-parser/src/formats/today/today.js";

const YT_API_KEY = process.env.YT_API_KEY;
const CHANNEL_ID = "UCfI5jzpoUbwP4wkmQ6ZNqbA";
const SIMILARITY_TRESHHOLD = 0.9;
const ENTITIES_PATH = "./entities.json";
const SKIP_FETCH = false;
const MAX_FETCH = 30;

dateParser.removeFormat(today); // remove now / today / yesterday / tomorrow

// $.verbose = false;

// ToC
// 1. Load entities
// 2. Fetch youtube videos
// 3. Extract entities (session, tag, tag, person) from videos
// 4. Create Dendron Notes
// 5. Save Dendron Note
// 6. Helper

// Load entities
// ========================

let entities = {};

try {
  entities = await fs.readJson(ENTITIES_PATH);
} catch (err) {
  entities = {
    sessions: {},
    series: {},
    persons: {},
    tags: {},
    videos: {},
  };
}

// Fetch youtube videos
// ========================

const videos = [];
let nextPageToken;
let count = 0;
let initial = true;

if (!SKIP_FETCH) {
  // fetch all videos from channel
  console.log("Fetching from Youtube API...");
  while ((count < MAX_FETCH && nextPageToken) || initial) {
    initial = false;
    count += 1;
    const resp = await fetch(
      `https://youtube.googleapis.com/youtube/v3/search?channelId=${CHANNEL_ID}&type=video&part=snippet&maxResults=50&key=${YT_API_KEY}${
        nextPageToken ? `&pageToken=${nextPageToken}` : ""
      }`
    );

    if (resp.ok) {
      const { items, nextPageToken: _nextPageToken } = await resp.json();
      videos.push(...items);
      nextPageToken = _nextPageToken;
    } else {
      console.error("fetch channel error", count, resp);
    }
  }

  entities.videos = entities.videos ?? {};

  console.log("Fetching single Videos from Youtube API...");

  for (const video of videos) {
    count += 1;
    const resp = await fetch(
      `https://youtube.googleapis.com/youtube/v3/videos?id=${video.id.videoId}&part=snippet&key=${YT_API_KEY}`,
      {
        headers: {
          // reduces youtube quota if entity did not change
          ETag: entities.videos[video.id.videoId]?.etag,
        },
      }
    );

    if (resp.ok) {
      const { items } = await resp.json();
      items.forEach((item) => {
        entities.videos[item.id] = item;
      });
    } else {
      if (resp.status !== 304) {
        console.error("fetch video error", count);
      }
    }

    await sleep(100); // prevents EHOSTUNREACH
  }

  console.log("Fetch Count: ", count);
}

// Extract entities (session, topic, tag, person) from videos
// ========================

console.log("Extracting entities...");

const nlpKeywords = winkNLP(model);
nlpKeywords.learnCustomEntities([
  {
    name: "tag",
    patterns: ["[|ADJ|PROPN] [NOUN|PROPN]"],
  },
  // extracting parts to that they do not disturb
  {
    name: "part",
    patterns: ["[Part|Session] [|0] [CARDINAL]"],
  },
  {
    name: "part",
    patterns: ["[S1|S2|S3|S4|S5|S6|S7]"],
  },
  {
    name: "date",
    patterns: ["DATE"],
  },
]);

const nlpPersons = winkNLP(model);
nlpPersons.learnCustomEntities([
  {
    name: "person",
    patterns: ["[ADJ|PROPN] [ADJ|PROPN] [|ADJ|PROPN]"],
  },
  {
    name: "person",
    patterns: ["[ADJ|PROPN] [ADJ|PROPN] [-] [ADJ|PROPN]"],
  },
]);

const nlpDates = winkNLP(model);
nlpDates.learnCustomEntities([
  {
    name: "date",
    patterns: ["DATE"],
  },
]);

Object.keys(entities.videos ?? []).map((videoId) => {
  /** @type {{ kind: string, etag: string, id: string, snippet: { publihsedAt:  string, channgelId: string, title: string, description: string, thumbnails: {}, channgelTitle: string, categoryId: string, liveBroadcastContent: string, localized: {} } }} */
  const video = entities.videos[videoId];
  const { id: youtubeId, snippet } = video;
  const { title: rawTitle, description: body, publishedAt } = snippet;
  const youtubePublishDate = new Date(publishedAt);

  const [nameStr, personStr] = decode(rawTitle).split(/\sw\/\s/);
  const tags = [],
    persons = [];
  let part = null;
  let date = null;
  const keywordsDoc = nlpKeywords.readDoc(`${nameStr}`);

  keywordsDoc
    .customEntities()
    .out(its.detail)
    .forEach(({ value, type }) => {
      if (type === "tag") {
        const hash = hasha(value, { algorithm: "md5" });

        if (!entities.tags[hash]) {
          const id = nanoid();
          const slug = createSlug(value);
          entities.tags[hash] = {
            id,
            hash,
            value,
            slug,
            type: value.split(" ").length === 1 ? "tag" : "topic", // tag does not contain space
          };
        }

        tags.push(hash);
      }
      if (type === "part") {
        part = Number((value.match(/\d+/g) ?? []).reverse()[0] ?? 1); // get the last number from the value and default to 1
      }
    });

  const dateDoc = nlpDates.readDoc(body);
  dateDoc
    .customEntities()
    .out(its.detail)
    .some(({ value }) => {
      const { invalid, year, month, day } = dateParser.attempt(value);
      if (!invalid) {
        date = new Date(
          year ?? youtubePublishDate.getFullYear(),
          (month ? month - 1 : null) ?? youtubePublishDate.getMonth(),
          day ?? youtubePublishDate.getDate()
        );
      }
      return !!date;
    });

  if (personStr) {
    const personDoc = nlpPersons.readDoc(personStr);
    personDoc
      .customEntities()
      .out(its.detail)
      .forEach(({ value, type }) => {
        const hash = hasha(value, { algorithm: "md5" });
        if (!entities.persons[hash]) {
          const id = nanoid();
          const slug = createSlug(value);
          entities.persons[hash] = {
            hash,
            id,
            value,
            slug,
            type,
          };
        }
        persons.push(hash);
      });
  }

  // create id with hasha for purpose of similarity
  const sessionHash = hasha(youtubeId, { algorithm: "md5" });

  const [title, desc] = decode(rawTitle)
    .replace(/\((.+)\)/, "") // remove noice
    .split(/\sw\/\s/)[0] // seperate by the w/ abbriviation
    .split(":"); // seperate header from subheader

  // keep slug from existing session (makes sure that there is only a single note for every session)
  let slug =
    entities.sessions[sessionHash]?.slug ??
    createSlug(`${title} ${desc ?? ""}`);

  entities.sessions[sessionHash] = {
    id: nanoid(),
    ...entities.sessions[sessionHash],
    hash: sessionHash,
    youtubeId,
    rawTitle,
    title,
    desc,
    body,
    created: date?.getTime() ?? youtubePublishDate.getTime(),
    persons,
    tags,
    slug,
    part,
  };
});

// add missing persons from tags table
Object.keys(entities.sessions ?? []).map((sessionHash) => {
  const session = entities.sessions[sessionHash];
  const persons = session.tags.filter((tag) =>
    Object.keys(entities.persons).includes(tag)
  );

  entities.sessions[sessionHash] = {
    ...session,
    tags: session.tags.filter((tag) => !persons.includes(tag)),
    persons: [...session.persons, ...persons],
  };
});

// correct slug collisions in sessions
const slugs = {};
Object.keys(entities.sessions).forEach((sessionHash) => {
  const session = entities.sessions[sessionHash];
  slugs[session.slug] = slugs[session.slug] ?? [];
  slugs[session.slug].push(session.hash);
});

Object.keys(slugs).forEach((slug) => {
  if (slugs[slug].length > 1) {
    // correct colliding slugs
    slugs[slug]
      .map((sessionHash) => {
        return entities.sessions[sessionHash];
      })
      .sort((a, b) => a.created - b.created)
      .forEach((session, index) => {
        session.slug = `${session.slug}-${session.part ?? index}`;
      });
  }
});

const sessions = Object.values(entities.sessions ?? {});

// create series
while (sessions.length) {
  const sessionA = sessions[0];
  const titleA = sessionA.title;
  sessions.splice(0, 1);

  const series = [sessionA];

  // start from end so that removing elements does not interfere with lookup
  for (let i = sessions.length - 1; i >= 0; i--) {
    const sessionB = sessions[i];

    const titleB = sessionB.title;

    const value = jaro(titleA, titleB);

    if (value.similarity > SIMILARITY_TRESHHOLD) {
      series.push(sessionB);
      sessions.splice(i, 1);
    }
  }

  series.sort((a, b) => {
    const numberA = Number(a.title.match(/\d+/g)?.join("")) || 0;
    const numberB = Number(b.title.match(/\d+/g)?.join("")) || 0;
    return numberA - numberB;
  });

  if (series.length > 1) {
    const hash = hasha(titleA, { algorithm: "md5" });
    entities.series[hash] = {
      id: nanoid(),
      ...entities.series[hash],
      hash,
      name: titleA,
      slug: createSlug(titleA.toLowerCase()),
      sessions: series.map((session) => session.hash),
    };

    // add series relation to session entity
    series.forEach((session) => {
      entities.sessions[session.hash].series =
        entities.sessions[session.hash].series ?? [];
      if (!entities.sessions[session.hash].series.includes(hash)) {
        entities.sessions[session.hash].series.push(hash);
      }
    });
  }
}

// Save entities
// ========================

console.log("Saving entities...");
await fs.writeJson("./entities.json", entities);

// Create Dendron Notes
// ========================

console.log("Creating Dendron Notes...");
const dendronNotes = [];

// add landingpage

const sessionsSortedByDate = Object.values(entities.sessions).sort(
  (a, b) => b.created - a.created
);
const landingNote = {
  fname: "the-stoa",
  title: "The Stoa",
  body: `

https://www.thestoa.ca/

## Timeline

| Date        | [[session]]   |
| ----------- | : -----------:|
${sessionsSortedByDate
  .map(
    (session) =>
      `| ${new Date(session.created).toDateString()} | [[session.${
        session.slug
      }]] | `
  )
  .join("\n")}
`,
};

dendronNotes.push(landingNote);

// sessions
Object.values(entities.sessions ?? {}).forEach((session) => {
  const {
    id,
    persons: personHashes,
    tags: tagHashes,
    series: seriesHashes,
    title,
    desc,
    slug,
    body,
    created,
    youtubeId,
    rawTitle,
  } = session;

  const persons = personHashes.map(
    (personHash) => entities.persons[personHash]
  );
  const topics = tagHashes
    .map((tagHash) => entities.tags[tagHash])
    .filter((tag) => tag.type === "topic");
  const tags = tagHashes
    .map((tagHash) => entities.tags[tagHash])
    .filter((tag) => tag.type === "tag");
  const series = (seriesHashes ?? []).map(
    (seriesHash) => entities.series[seriesHash]
  );

  const note = {
    id,
    fname: `session.${slug}`,
    title,
    desc,
    created,
    body: `

${desc ?? ""}

${new Date(created).toDateString()}

<iframe width="560" height="315" src="https://www.youtube.com/embed/${youtubeId}" title="${rawTitle}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen ></iframe>

${body}

## Persons

${persons.map((person) => `- [[person.${person.slug}]]`).join("\n")}

## Tags

${tags.map((tag) => `- #${tag.slug}`).join("\n")}

## Topics

${topics.map((topic) => `- #topics.${topic.slug}`).join("\n")}

`,
  };
  dendronNotes.push(note);
});

// persons
Object.values(entities.persons ?? {}).forEach((person) => {
  const { id, value, slug, hash } = person;

  const { length: visits } = Object.values(entities.sessions).filter(
    (session) => session.persons.includes(hash)
  );

  const note = {
    id,
    fname: `person.${slug}`,
    title: value,
    body: `

- [[person]] - ${value}
- appeared ${visits}x at the stoa
`,
  };
  dendronNotes.push(note);
});

// tags
Object.values(entities.tags ?? {}).forEach((tag) => {
  const { id, value, slug, type } = tag;

  const note = {
    id,
    fname: `tags${type === "topic" ? ".topics." : "."}${slug}`,
    title: value,
  };
  dendronNotes.push(note);
});

// series
Object.values(entities.series ?? {})
  .filter((series) => !entities.persons[series.id]) // check for collisions
  .forEach((series) => {
    const { id, name, slug, sessions: sessionHashes } = series;

    const note = {
      id,
      fname: `series.${slug}`,
      title: name,
      body: `
${sessionHashes
  .map(
    (sessionHash) =>
      `- [[${entities.sessions[sessionHash].title}: ${entities.sessions[sessionHash].desc}|session.${entities.sessions[sessionHash].slug}]]`
  )
  .join("\n")}
`,
    };
    dendronNotes.push(note);
  });

// Save Dendron Note
// ========================

console.log("Saving Dendron Notes...");
await fs.writeJson("./notes.json", dendronNotes);

// Helper
// ========================

function createSlug(value) {
  return slugify(value.toLowerCase()).replace(/\./g, "");
}

// Logs
// ========================

// console.log(JSON.stringify(dendronNotes));

// console.log(JSON.stringify(entities, null, 2));

// Object.values(entities.series).forEach((serie) => {
//   if (serie.name.includes("Networked Tribalism")) {
//     console.log(serie);
//     console.log("hier");
//   }
// });
