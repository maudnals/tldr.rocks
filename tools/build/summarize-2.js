import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";
import htmlclean from "htmlclean";
import jsdom from "jsdom";
import parseArgs from "minimist";
const PageParser = {
  jsdom: function (html) {
    const dom = new jsdom.JSDOM(htmlclean(html));
    const text = dom.window.document.body.textContent;
    const url = dom.window.document.querySelector("span.titleline > a")?.href;
    return { text, url };
  },
  getTextContent: function (html) {
    const dom = new jsdom.JSDOM(htmlclean(html));
    const text = dom.window.document.body.textContent;
    return { text };
  },
  getTitle: function (html) {
    const dom = new jsdom.JSDOM(html);
    return { title: dom.window.document.title };
  },
  join: function (html) {
    return { data: JSON.stringify(html) };
  },
};
const argv = parseArgs(process.argv.slice(2));
if (argv._.length !== 1) {
  console.error("Usage: summarize.ts [--model=MODEL] <hn-post-id>");
  process.exit(1);
}
const hn_post = argv._[0];
const modelId = argv.model || "claude";
const providers = {
  claude: createAnthropic({
    apiKey: process.env.CLAUDE_API_KEY,
  }),
  gemini: createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
  }),
  openai: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }),
  groq: createGroq({
    apiKey: process.env.GROQ_API_KEY,
  }),
};

if (!providers[modelId]) {
  console.error(
    `Invalid model '${modelId}'. Available models are: ${Object.keys(
      providers
    ).join(", ")}`
  );
  process.exit(1);
}
const provider = providers[modelId];
const models = {
  claude: {
    hn: "claude-3-5-sonnet-20240620",
    article: "claude-3-haiku-20240307",
  },
  gemini: {
    hn: "gemini-pro",
    article: "gemini-pro",
  },
  openai: {
    hn: "gpt-4o",
    article: "gpt-3.5-turbo",
  },
  groq: {
    hn: "llama3-8b-8192",
    article: "llama3-8b-8192",
  },
};
const model = models[modelId];
const rawContent = await fetch(
  `https://news.ycombinator.com/item?id=${hn_post}`
).then((res) => res.text());
const { text, url } = PageParser.jsdom(rawContent);
const { title } = PageParser.getTitle(rawContent);
const { text: content } = PageParser.getTextContent(rawContent);
if (url == undefined) {
  console.error("Could not find URL from the Hacker News post.");
  process.exit(1);
}
const { text: hnSummary } = await generateText({
  model: provider(model.hn),
  prompt: `Summarize this Hacker News post. The output should be in Markdown and have three sections: Positive Sentiment; Negative Sentiment; Recommend actions to address the feedback.
    
  Extract up to 5 of the most relevant links to external content that are in the text and add them to an "Interesting links" section. Do not include malformed URLs.
  
  ${content}
  
  ### Summary:
"`,
});
const articleContent = await fetch(url).then((res) => res.text());
const { text: articleSummary } = await generateText({
  model: provider(model.article),
  prompt: `Create a summary of the following blog post, roughly a paragraph or two in length:
      
${articleContent}
      
## Summary:

`,
});
console.log(`---
slug: hn-${hn_post}
date: '${new Date().toISOString()}'
title: "Report: ${title}"
about: ${url}
source: https://news.ycombinator.com/item?id=${hn_post}
generator: ${modelId}
tags:
- hackernews
- summary
- ${modelId}
---
### Article summary
${articleSummary}

### Comment summary
${hnSummary}
`);
