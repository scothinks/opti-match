# OptiMatch – ID Validation Assistant

OptiMatch is a web-based tool that helps agencies and data managers validate Excel-based beneficiary or staff records against a source of truth (e.g., a verified registration database).

## Features

- Upload 2 Excel files: data to validate & source of truth
- Automatic fuzzy matching of NIN, SSID, and full names
- Results preview with status: Valid / Partial Match / Invalid
- Download filtered results as XLSX or CSV
- Save & restore validation sessions via localStorage
- Coming soon: share sessions with your team

## Tech Stack

- Next.js 14 (App Router)
- React + Tailwind + shadcn/ui
- Chart.js for visual summaries
- XLSX + file-saver for Excel handling
- Fuzzball for name similarity scoring

## Usage

```bash
npm install
npm run dev
