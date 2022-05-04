#!/usr/bin/env zx


const ENTITIES_PATH = "./entities.json";

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

## Series

${series.map((_series) => `- [[series.${_series.slug}]]`).join("\n")}

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
