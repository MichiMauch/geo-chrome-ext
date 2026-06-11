import { t } from './i18n';

export type SnippetLanguage = 'html' | 'json-ld' | 'txt' | 'robots';

export interface FixSnippet {
  type: 'snippet';
  language: SnippetLanguage;
  code: string;
  note: string;
}

export interface NoSnippet {
  type: 'no-snippet';
  note: string;
}

export type FixSnippetResult = FixSnippet | NoSnippet;

function jsonLdArticle(): string {
  return `<!-- ${t('snippet_comment_schema_article')} -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{{HEADLINE}}",
  "description": "{{DESCRIPTION}}",
  "image": "{{IMAGE_URL}}",
  "author": {
    "@type": "Person",
    "name": "{{AUTHOR_NAME}}",
    "url": "{{AUTHOR_URL}}"
  },
  "datePublished": "{{PUBLISH_DATE}}",
  "dateModified": "{{MODIFIED_DATE}}",
  "publisher": {
    "@type": "Organization",
    "name": "{{ORG_NAME}}",
    "logo": {
      "@type": "ImageObject",
      "url": "{{LOGO_URL}}"
    }
  },
  "mainEntityOfPage": "{{PAGE_URL}}"
}
</script>`;
}

function jsonLdFaq(): string {
  return `<!-- ${t('snippet_comment_faq')} -->
<section>
  <h2>{{FAQ_HEADING}}</h2>
  <details>
    <summary>{{QUESTION_1}}</summary>
    <p>{{ANSWER_1}}</p>
  </details>
  <details>
    <summary>{{QUESTION_2}}</summary>
    <p>{{ANSWER_2}}</p>
  </details>
</section>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "{{QUESTION_1}}",
      "acceptedAnswer": { "@type": "Answer", "text": "{{ANSWER_1}}" }
    },
    {
      "@type": "Question",
      "name": "{{QUESTION_2}}",
      "acceptedAnswer": { "@type": "Answer", "text": "{{ANSWER_2}}" }
    }
  ]
}
</script>`;
}

function authorMarkup(): string {
  return `<!-- ${t('snippet_comment_author')} -->
<meta name="author" content="{{AUTHOR_NAME}}">

<article>
  <header>
    <h1>{{HEADLINE}}</h1>
    <p class="byline">
      ${t('snippet_label_by')} <a rel="author" href="{{AUTHOR_URL}}">{{AUTHOR_NAME}}</a>
    </p>
  </header>
</article>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "{{AUTHOR_NAME}}",
  "url": "{{AUTHOR_URL}}",
  "jobTitle": "{{AUTHOR_JOB_TITLE}}",
  "worksFor": { "@type": "Organization", "name": "{{ORG_NAME}}" }
}
</script>`;
}

function dateMarkup(): string {
  return `<!-- ${t('snippet_comment_date')} -->
<meta property="article:published_time" content="{{PUBLISH_DATE}}">
<meta property="article:modified_time" content="{{MODIFIED_DATE}}">

<p>
  ${t('snippet_label_published')}
  <time datetime="{{PUBLISH_DATE}}">{{PUBLISH_DATE_DISPLAY}}</time>
  · ${t('snippet_label_updated')}
  <time datetime="{{MODIFIED_DATE}}">{{MODIFIED_DATE_DISPLAY}}</time>
</p>`;
}

function llmsTxtTemplate(): string {
  return `# {{SITE_NAME}}

> {{SITE_DESCRIPTION_ONE_LINER}}

## ${t('snippet_label_keyPages')}

- [{{PAGE_TITLE_1}}]({{PAGE_URL_1}}): {{PAGE_SUMMARY_1}}
- [{{PAGE_TITLE_2}}]({{PAGE_URL_2}}): {{PAGE_SUMMARY_2}}
- [{{PAGE_TITLE_3}}]({{PAGE_URL_3}}): {{PAGE_SUMMARY_3}}

## ${t('snippet_label_about')}

{{ABOUT_PARAGRAPH}}

## ${t('snippet_label_contact')}

- Email: {{CONTACT_EMAIL}}
- Web: {{CONTACT_URL}}

## ${t('snippet_label_optional')}

- [Blog]({{BLOG_URL}})
- [Sitemap]({{SITEMAP_URL}})`;
}

function robotsAllowAiBots(): string {
  return `# ${t('snippet_comment_robots')}
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: cohere-ai
Allow: /

# ${t('snippet_comment_robots_sitemap')}
Sitemap: {{SITEMAP_URL}}`;
}

function h1Snippet(): string {
  return `<!-- ${t('snippet_comment_h1')} -->
<h1>{{MAIN_TOPIC_AS_HEADLINE}}</h1>

<p>{{ONE_SENTENCE_SUMMARY_OF_PAGE}}</p>`;
}

function definitionSnippet(): string {
  return `<!-- ${t('snippet_comment_definitions')} -->
<section>
  <h2>${t('snippet_label_whatIs')} {{TERM}}?</h2>
  <p>
    <strong>{{TERM}}</strong> ${t('snippet_label_is')} {{ONE_SENTENCE_DEFINITION}}.
    {{ELABORATING_SENTENCE}}.
  </p>
</section>`;
}

function listSnippet(): string {
  return `<!-- ${t('snippet_comment_lists')} -->
<h2>{{LIST_HEADING}}</h2>
<ul>
  <li><strong>{{ITEM_1_TITLE}}:</strong> {{ITEM_1_DESCRIPTION}}</li>
  <li><strong>{{ITEM_2_TITLE}}:</strong> {{ITEM_2_DESCRIPTION}}</li>
  <li><strong>{{ITEM_3_TITLE}}:</strong> {{ITEM_3_DESCRIPTION}}</li>
</ul>`;
}

function semanticHtmlSnippet(): string {
  return `<!-- ${t('snippet_comment_semantic')} -->
<body>
  <header>
    <nav><!-- {{SITE_NAVIGATION}} --></nav>
  </header>

  <main>
    <article>
      <header>
        <h1>{{HEADLINE}}</h1>
        <p>{{LEAD_PARAGRAPH}}</p>
      </header>

      <section>
        <h2>{{SECTION_HEADING}}</h2>
        <p>{{SECTION_CONTENT}}</p>
      </section>

      <aside>
        <!-- {{RELATED_LINKS_OR_PULL_QUOTES}} -->
      </aside>
    </article>
  </main>

  <footer>
    <!-- {{SITE_FOOTER}} -->
  </footer>
</body>`;
}

function entitySnippet(): string {
  return `<!-- ${t('snippet_comment_entities')} -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "{{ORG_NAME}}",
  "url": "{{ORG_URL}}",
  "logo": "{{LOGO_URL}}",
  "sameAs": [
    "{{WIKIPEDIA_URL}}",
    "{{LINKEDIN_URL}}",
    "{{TWITTER_URL}}"
  ]
}
</script>`;
}

function sourcedClaimsSnippet(): string {
  return `<!-- ${t('snippet_comment_sourced')} -->
<p>
  {{CLAIM_TEXT}}
  <sup><a href="#source-1" id="ref-1">[1]</a></sup>
</p>

<section id="sources">
  <h2>${t('snippet_label_sources')}</h2>
  <ol>
    <li id="source-1">
      <a href="{{SOURCE_URL_1}}" rel="noopener" target="_blank">{{SOURCE_TITLE_1}}</a>
      — {{SOURCE_AUTHOR_OR_PUBLICATION_1}}, {{SOURCE_DATE_1}}
    </li>
  </ol>
</section>`;
}

function factsSnippet(): string {
  return `<!-- ${t('snippet_comment_facts')} -->
<section>
  <h2>{{TOPIC}} ${t('snippet_label_inNumbers')}</h2>
  <ul>
    <li><strong>{{NUMBER_1}}</strong> {{CONTEXT_1}}
      (${t('snippet_label_source')}: <a href="{{SOURCE_URL_1}}">{{SOURCE_NAME_1}}</a>, {{YEAR_1}})</li>
    <li><strong>{{NUMBER_2}}</strong> {{CONTEXT_2}}
      (${t('snippet_label_source')}: <a href="{{SOURCE_URL_2}}">{{SOURCE_NAME_2}}</a>, {{YEAR_2}})</li>
  </ul>
</section>`;
}

function keyInfoUpfrontSnippet(): string {
  return `<!-- ${t('snippet_comment_upfront')} -->
<h1>{{HEADLINE}}</h1>

<p class="lead">
  <strong>{{ONE_SENTENCE_TLDR}}</strong>
  {{TWO_TO_THREE_SENTENCES_WITH_KEY_FACTS_NUMBERS_AND_DEFINITIONS}}
</p>`;
}

function sectionsSnippet(): string {
  return `<!-- ${t('snippet_comment_sections')} -->
<article>
  <h1>{{MAIN_TOPIC}}</h1>

  <section>
    <h2>{{ASPECT_1}}</h2>
    <p>{{CONTENT_ABOUT_ASPECT_1}}</p>
  </section>

  <section>
    <h2>{{ASPECT_2}}</h2>
    <p>{{CONTENT_ABOUT_ASPECT_2}}</p>
  </section>

  <section>
    <h2>{{ASPECT_3}}</h2>
    <p>{{CONTENT_ABOUT_ASPECT_3}}</p>
  </section>
</article>`;
}

function sourcesSnippet(): string {
  return `<!-- ${t('snippet_comment_sources')} -->
<section>
  <h2>${t('snippet_label_furtherReading')}</h2>
  <ul>
    <li>
      <a href="{{TRUSTED_SOURCE_URL_1}}" rel="noopener" target="_blank">
        {{TRUSTED_SOURCE_TITLE_1}}
      </a>
      — {{ONE_SENTENCE_WHY_THIS_SOURCE_IS_RELEVANT}}
    </li>
    <li>
      <a href="{{TRUSTED_SOURCE_URL_2}}" rel="noopener" target="_blank">
        {{TRUSTED_SOURCE_TITLE_2}}
      </a>
      — {{ONE_SENTENCE_WHY_THIS_SOURCE_IS_RELEVANT}}
    </li>
  </ul>
</section>`;
}

function canonicalSnippet(): string {
  return `<!-- ${t('snippet_comment_canonical')} -->
<link rel="canonical" href="https://www.example.com/your-page/">`;
}

export function getFixSnippet(key: string): FixSnippetResult | null {
  switch (key) {
    case 'no_schema':
      return { type: 'snippet', language: 'json-ld', code: jsonLdArticle(), note: t('snippet_note_schema') };
    case 'no_faq':
      return { type: 'snippet', language: 'html', code: jsonLdFaq(), note: t('snippet_note_faq') };
    case 'no_author':
      return { type: 'snippet', language: 'html', code: authorMarkup(), note: t('snippet_note_author') };
    case 'no_date':
      return { type: 'snippet', language: 'html', code: dateMarkup(), note: t('snippet_note_date') };
    case 'no_llms_txt':
      return { type: 'snippet', language: 'txt', code: llmsTxtTemplate(), note: t('snippet_note_llmstxt') };
    case 'ai_bots_blocked':
      return { type: 'snippet', language: 'robots', code: robotsAllowAiBots(), note: t('snippet_note_robots') };
    case 'no_h1':
      return { type: 'snippet', language: 'html', code: h1Snippet(), note: t('snippet_note_h1') };
    case 'no_definitions':
      return { type: 'snippet', language: 'html', code: definitionSnippet(), note: t('snippet_note_definitions') };
    case 'no_lists':
      return { type: 'snippet', language: 'html', code: listSnippet(), note: t('snippet_note_lists') };
    case 'weak_semantic_html':
      return { type: 'snippet', language: 'html', code: semanticHtmlSnippet(), note: t('snippet_note_semantic') };
    case 'few_entities':
      return { type: 'snippet', language: 'json-ld', code: entitySnippet(), note: t('snippet_note_entities') };
    case 'no_sourced_claims':
      return { type: 'snippet', language: 'html', code: sourcedClaimsSnippet(), note: t('snippet_note_sourced') };
    case 'no_facts':
      return { type: 'snippet', language: 'html', code: factsSnippet(), note: t('snippet_note_facts') };
    case 'no_key_info_upfront':
      return { type: 'snippet', language: 'html', code: keyInfoUpfrontSnippet(), note: t('snippet_note_upfront') };
    case 'few_sections':
      return { type: 'snippet', language: 'html', code: sectionsSnippet(), note: t('snippet_note_sections') };
    case 'few_sources':
      return { type: 'snippet', language: 'html', code: sourcesSnippet(), note: t('snippet_note_sources') };
    case 'canonical_missing':
      return { type: 'snippet', language: 'html', code: canonicalSnippet(), note: t('snippet_note_canonical') };
    case 'canonical_mismatch':
      return { type: 'no-snippet', note: t('snippet_none_canonical_mismatch') };
    case 'bad_hierarchy':
      return { type: 'no-snippet', note: t('snippet_none_bad_hierarchy') };
    case 'low_scanability':
      return { type: 'no-snippet', note: t('snippet_none_low_scanability') };
    default:
      return null;
  }
}

export function getSnippetLanguageLabel(lang: SnippetLanguage): string {
  switch (lang) {
    case 'json-ld': return 'JSON-LD';
    case 'html': return 'HTML';
    case 'txt': return 'llms.txt';
    case 'robots': return 'robots.txt';
  }
}
