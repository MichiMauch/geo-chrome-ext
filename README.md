# Paul AI GEO Analyzer

A Chrome extension that analyzes web pages for Generative Engine Optimization (GEO).

## What is GEO?

Generative Engine Optimization prepares your content for AI-powered search engines and assistants. As AI systems like ChatGPT, Perplexity, and Google AI Overviews become primary information sources, your content needs to be structured for machine understanding.

## Features

- **Instant Analysis** - One-click GEO scoring for any webpage
- **4 Key Categories** - Content clarity, answerability, trust signals, machine readability
- **Score 0-20** - Clear rating (Excellent/Good/Needs Improvement/Critical)
- **Top 5 Recommendations** - Prioritized, actionable improvements
- **Privacy-First** - All analysis runs locally, no data sent to servers
- **Bilingual** - German and English UI based on browser language

## Analysis Criteria

| Category | What's Checked |
|----------|----------------|
| Content Clarity | H1 presence, heading hierarchy, scannability |
| Answerability | Definitions, lists, structured sections |
| Trust & Sources | Author info, dates, external references |
| Machine Readability | Schema.org markup, semantic HTML, llms.txt |

## Installation

### From Chrome Web Store
[Install Paul AI GEO Analyzer](https://chrome.google.com/webstore/detail/...)

### Manual Installation (Development)
1. Clone this repository
2. Run `npm install && npm run build`
3. Open `chrome://extensions`
4. Enable "Developer mode"
5. Click "Load unpacked" and select the `dist` folder

## Usage

1. Navigate to any webpage
2. Click the extension icon
3. View your GEO score and recommendations

## Tech Stack

- TypeScript
- Vite
- Chrome Extension Manifest V3
- Tailwind CSS

## License

MIT

## Credits

Developed by [NETNODE](https://www.netnode.ch) - Swiss digital agency
