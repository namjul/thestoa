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
  return `content/authors/${entities.persons[personHash].slug}.md`;
}

// add authors
files.push(
  ...Object.values(entities.persons).map((person) => {
    const { value, slug, hash } = person;

    return {
      fname: getAuthorId(hash),
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

files.push({
  fname: sessionTagId,
  frontmatter: {
    name: "Session",
    slug: "session",
  },
});

files.push({
  fname: seriesTagId,
  frontmatter: {
    name: "Series",
    slug: "series",
  },
});

files.push(
  ...Object.values(entities.tags).map((tag) => {
    const { value, slug, hash } = tag;

    return {
      fname: getTagId(hash),
      frontmatter: {
        name: value,
        slug: slug,
      },
    };
  })
);

files.push(
  ...Object.values(entities.series).map((serie) => {
    const { name, slug, hash } = serie;

    return {
      fname: getSeriesId(hash),
      frontmatter: {
        name,
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
      youtubeId,
      rawTitle,
    } = session;

    const persons = personHashes.map((pHash) => entities.persons[pHash])
    const tags = tagHashes.map((tHash) => entities.tags[tHash])

    const tagsSet = new Set(
      [sessionTagId]
        .concat(...tags.map((tag) => getTagId(tag.hash)))
        .concat(...seriesHashes.map((seriesHash) => getSeriesId(seriesHash)))
    );

    return {
      fname: `content/posts/${slug}.mdx`,
      frontmatter: {
        title,
        excerpt: desc,
        date: new Date(created).toISOString(),
        slug: slug,
        primary_author: (persons.map(person => person.slug)).join(', '),
        primary_tag: (tags[0] ?? {}).slug,
        authors: persons.map(person => ({ author: getAuthorId(person.hash) })),
        tags: Array.from(tagsSet).map((tag) => ({ tag })),
      },
      content: `

${desc ?? ""}

${new Date(created).toDateString()}

<iframe width="560" height="315" src="https://www.youtube.com/embed/${youtubeId}" title="${rawTitle}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen ></iframe>

${body}

`,
    };
  })
);

files.push(
  ...Object.values(entities.series).map((serie) => {
    const { hash, name, slug } = serie;

    return {
      fname: `content/posts/${slug}.mdx`,
      frontmatter: {
        title: name,
        date: new Date().toISOString(),
        slug: slug,
        tags: [{ tag: seriesTagId }, { tag: getSeriesId(hash) }],
      },
    };
  })
);

// pages
files.push({
  fname: "content/pages/home.mdx",
  frontmatter: {
    title: "The Stoa",
    date: new Date().toISOString(),
    slug: "the-stoa",
  },
  content: "https://www.thestoa.ca/",
});

console.log("Saving Gspenst Notes...");
await fs.writeJson("./gspenst-notes.json", files);

console.log("Generate Gspenst Contents...");

const mapForNextra = (frontmatter) => ({
  title: frontmatter.title ?? frontmatter.name ?? frontmatter.slug,
  date: frontmatter.date ?? (new Date()).toISOString(),
  description: frontmatter.excerpt,
  tag: frontmatter.primary_tag,
  author: frontmatter.primary_author,
})

files.forEach(({ fname, frontmatter, content }) => {
  fs.outputFile(
    path.resolve(fname),
    `---
${YAML.stringify(mapForNextra(frontmatter)).trimEnd()}
---

${content ?? ""}
`
  );
});
