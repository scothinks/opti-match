
# 🧠 OptiMatch – Intelligent Data Validation & Lookup Suite

**OptiMatch** is a powerful, web-based suite designed for agencies and data managers to streamline data integrity operations. It provides robust tools for validating large, spreadsheet-based beneficiary or staff records against a source of truth and performing high-speed lookups.

---

## 🔑 Key Components

- **OptiMatch Validator**: Comprehensive, fuzzy-matched validation for entire spreadsheets.
- **Smart Lookup**: High-performance interface for single or batch record lookups against a master list.

---

## ✨ Core Features

### 🗂️ File Parsing & Validation (`/api/validate`)
- **Robust Spreadsheet Parsing**: Parses `.xlsx` and `.csv` files, even messy ones with irregular headers.
- **Accurate Row Counting**: Skips phantom rows and counts only real records.
- **Multi-key Fuzzy Matching**: Validates against SSID, NIN, and full names using `fuzzball.token_set_ratio`.
- **Source Integrity Check**: Flags duplicate SSIDs in source-of-truth file.
- **Duplicate Request Prevention**: Prevents redundant entries from being processed.
- **Detailed Results Summary**: Clearly classifies rows as Valid, Partial Match, or Invalid.

### 🔍 High-Performance Lookup (`/api/lookup` & UI)
- **Dual Modes**: Lookup single entries or full files using a tab-based UI.
- **Flexible Sources**: Choose default master list or upload a temporary one.
- **In-Memory Caching**: Fast response times powered by cache warming on server start.
- **Resilient Networking**: Backend logic is hardened against transient failures.

### 🧑‍💻 User Interface & UX
- **Drag-and-Drop Uploads**: Intuitive UI for all file interactions.
- **Filterable Results Table**: Badge-based status display with CSV export.
- **Streamlined Workflow**: "New Lookup" and "Return to Home" shortcuts improve usability.
- **Monitoring**: Integrated with Vercel Analytics + Speed Insights.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + `shadcn/ui`
- **Icons**: Lucide React
- **Fuzzy Matching**: `fuzzball`
- **File Parsing**: `xlsx` (SheetJS)
- **Storage**: `@vercel/blob`
- **Hosting & Monitoring**: Vercel + Analytics + Speed Insights

---

## 🚀 Getting Started

### Prerequisites

- Node.js v18+
- npm or yarn

### Installation

```bash
git clone https://github.com/scothinks/opti-match.git
cd opti-match
npm install
```

---

### ⚙️ Environment Setup

Create a `.env.local` file in the root of the project:

```env
# Vercel Blob Storage Read/Write Token (required for file uploads)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Optional: override default master list
# DEFAULT_SOURCE_URL=https://your-source-url.com/data.csv
```

---

### ▶️ Run Locally

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to explore the app.

---

## 📁 Project Structure

```text
/
├── app/
│   ├── api/
│   │   ├── lookup/       # Backend logic for lookup tool
│   │   └── validate/     # Backend logic for validation tool
│   ├── lib/
│   │   └── dataSource.ts # Data fetch + cache logic
│   ├── lookup/           # Lookup UI
│   └── layout.tsx        # Root layout with analytics
├── components/           # Shared UI components
└── public/               # Static assets
```

---

## 🛣️ Roadmap

- 🔜 **Shareable Sessions** – Allow session sharing via unique link 
- 🔜 **Access Control** – Implement user permissions for approving partial and invalid results. 
- 🔜 **Database Integration** – Move to Vercel Postgres for structured persistence  
- 🔜 **Advanced Visualizations** – Use Chart.js for rich validation summaries  

---

