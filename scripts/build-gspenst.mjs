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

// Create Gspenst files
// ========================

console.log("Creating Gspenst Files...");

await $`mkdir -p ./content/`;

const files = [];

function getTagId(hash) {
  return `content/tags/${entities.tags[hash].slug}.md`;
}

function getSeriesId(seriesHash) {
  return `content/tags/${entities.series[seriesHash].slug}.md`;
}

function getSessionId(sessionHash) {
  return `content/posts/${entities.sessions[sessionHash].slug}.md`;
}

function getAuthorId(personHash) {
  return `content/author/${entities.persons[personHash].slug}.md`;
}

// add authors
files.push(
  ...Object.values(entities.persons).map((person) => {
    const { value, slug } = person;

    return {
      fname: `content/authors/${slug}.mdx`,
      frontmatter: {
        name: value,
        slug: slug,
      },
    };
  })
);

// add tags
const sessionTagId = "content/tags/session.md";
const seriesTagId = "content/tags/series.md";

files.push(
  ...Object.values(entities.tags).map((tag) => {
    const { value, slug } = tag;

    return {
      fname: `content/tags/${slug}.md`,
      frontmatter: {
        name: value,
        slug: slug,
      },
    };
  })
);

files.push(
  ...Object.values(entities.series).map((serie) => {
    const { value, slug } = serie;

    return {
      fname: `content/tags/${slug}.md`,
      frontmatter: {
        name: value,
        slug: slug,
      },
    };
  })
);

// add posts
files.push(
  ...Object.values(entities.sessions).map((session) => {
    const {
      persons: personHashes = [],
      tags: tagHashes = [],
      series: seriesHashes = [],
      title,
      desc,
      slug,
      body,
      created,
      // youtubeId,
      // rawTitle,
    } = session;

    const authors = personHashes.map((personHash) => ({
      author: getAuthorId(personHash),
    }));
    const tagsSet = new Set([sessionTagId]
      .concat(...tagHashes.map((tagHash) => getTagId(tagHash)))
      .concat(...seriesHashes.map((seriesHash) => getSeriesId(seriesHash))))

    const tags = Array.from(tagsSet).map(tag => ({ tag }))

    return {
      fname: `content/posts/${slug}.mdx`,
      frontmatter: {
        title,
        excerpt: desc,
        date: new Date(created).toISOString(),
        slug: slug,
        authors,
        tags
      },
      content: body,
    };
  })
);

files.push(
  ...Object.values(entities.series).map((serie) => {
    const {
      hash,
      name,
      slug,
    } = serie;

    return {
      fname: `content/posts/${slug}.mdx`,
      frontmatter: {
        title: name,
        date: new Date().toISOString(),
        slug: slug,
        tags: [{ tag: seriesTagId }, { tag: getSeriesId(hash) }]
      },
    };
  })
);

console.log("Saving Gspenst Notes...");
await fs.writeJson("./gspenst-notes.json", files);
