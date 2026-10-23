# Indeed Job Application Assistant

A local Node.js and Playwright tool for organizing Canadian job searches and preparing applications for review. It searches selected Indeed markets, scores and de-duplicates listings, opens supported application flows, and fills fields only when the answer is known.

The assistant is deliberately designed to keep the applicant in control: it never submits an application, bypasses a CAPTCHA, or completes a login challenge.

## Features

- Searches configurable job categories and locations
- Filters listings by keywords, age, and relevance score
- De-duplicates previously reviewed jobs
- Opens supported Indeed Apply flows
- Fills only fields with confidently known answers
- Stops when a question requires human judgment
- Saves local application and review history
- Supports a dry-run mode for reviewing matches before applying

## Safety and Privacy

- Final submission always remains manual.
- CAPTCHA and login verification are never bypassed.
- Personal configuration is stored in `config.json`, which is excluded from Git.
- Local browser profiles and application records are excluded from Git.
- The included `config.example.json` contains example values only.

Review every application carefully before submitting it. Job sites change over time, so selectors and supported flows may occasionally require maintenance.

## Technology Stack

- Node.js 20+
- JavaScript ES modules
- Playwright
- Node.js built-in test runner

## Installation

```bash
npm install
npm run install-browser
cp config.example.json config.json
```

Open `config.json` and replace the example values with your own local settings. Never commit the completed `config.json` file.

## Configuration

The main settings include:

- `locations`: cities or regions to search
- `searches`: job categories, search terms, and matching resume paths
- `daysOld`: maximum listing age
- `minimumScore`: minimum relevance score
- `excludeTitleKeywords`: titles or seniority levels to exclude
- `maxJobsPerRun`: maximum jobs to process in one session

## Usage

Preview matching jobs without starting an application:

```bash
npm run dry-run
```

Start the guided workflow:

```bash
npm start
```

The first run opens a dedicated browser window. Sign in normally if required and complete any verification yourself. The assistant pauses whenever it encounters a question it cannot answer safely.

## Testing

Run the automated tests with:

```bash
npm test
```

## Local Data

Application results are stored under `data/`. De-duplication history, personal configuration, and the local browser profile are ignored by Git and should remain on your computer.

## Project Structure

```text
indeed-application-assistant/
├── src/                 Application logic
├── test/                Automated tests
├── data/                Local generated records (ignored)
├── config.example.json  Safe configuration template
├── package.json         Commands and dependencies
└── README.md            Project documentation
```

## Responsible Use

Use this project as a personal productivity aid, follow the terms of the websites you visit, and verify all generated or filled information before submitting an application.
