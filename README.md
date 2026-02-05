# ThunderDB Documentation

Official documentation site for **ThunderDB** — The Distributed HTAP Database for the AI Era.

Built with [Hugo](https://gohugo.io/) and the [Docsy](https://www.docsy.dev/) theme.

**Live site:** [https://thunderdb.io/docs/](https://thunderdb.io/docs/)

---

## About ThunderDB

ThunderDB is a production-grade distributed database written in Rust that unifies three traditionally separate systems into a single engine:

- **OLTP** — ACID-compliant transactional workloads
- **OLAP** — Real-time analytical and BI queries
- **Vector Search** — AI/ML embeddings and semantic search

Instead of maintaining separate databases (e.g., PostgreSQL + ClickHouse + Pinecone) with complex ETL pipelines between them, ThunderDB handles all three workloads in one place.

### Multi-Protocol Support

ThunderDB speaks the wire protocols your applications already use:

| Protocol | Version |
|----------|---------|
| PostgreSQL | v3 |
| MySQL | 4.1+ |
| Redis / RESP | 2 & 3 |
| REST API | HTTP/1.1 & HTTP/2 |
| gRPC | Protocol Buffers v3 |
| GraphQL | June 2018 Spec |
| WebSocket | RFC 6455 |

### Repository

ThunderDB source code: [github.com/smetal1/thunder-db](https://github.com/smetal1/thunder-db)

---

## Documentation Structure

```
content/docs/
├── getting-started/     # Installation, quickstart, first queries
├── architecture/        # System internals, storage engine, query pipeline
├── developer/           # Developer-facing reference material
│   ├── api-reference/   #   REST, gRPC, GraphQL, WebSocket APIs
│   ├── sql-reference/   #   Data types, operators, functions
│   ├── sdk/             #   Python, Go, Node.js, Rust, Java drivers
│   └── examples/        #   End-to-end application patterns
├── administrator/       # Operations and deployment guides
│   ├── configuration/   #   Tuning and parameters
│   ├── deployment/      #   Kubernetes, Docker, bare-metal
│   ├── monitoring/      #   Prometheus, Grafana, alerting
│   ├── security/        #   TLS, authentication, RBAC, audit
│   ├── backup-recovery/ #   Data protection strategies
│   └── troubleshooting/ #   Common issues and solutions
└── contributor/         # Contributing to ThunderDB
    ├── development-setup/
    ├── codebase-guide/
    ├── testing/
    └── release-process/
```

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Hugo (extended)](https://gohugo.io/installation/) | >= 0.110.0 | Extended version required for SCSS |
| [Node.js](https://nodejs.org/) | >= 18.x | Required for PostCSS / Autoprefixer |
| [Go](https://go.dev/dl/) | >= 1.21 | Required for Hugo Modules |
| [Git](https://git-scm.com/) | any recent | Submodule support needed |

---

## Getting Started

### 1. Clone the Repository

```bash
git clone --recurse-submodules https://github.com/smetal1/thunder-db-docs.git
cd thunderdb-docs
```

If you already cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Development Server

```bash
hugo server
```

The site will be available at **http://localhost:1313/docs/**. Hugo watches for file changes and live-reloads automatically.

### 4. Build for Production

```bash
hugo --minify
```

The generated static site is output to the `public/` directory.

---

## Project Layout

```
.
├── hugo.toml              # Hugo site configuration
├── go.mod / go.sum        # Go module dependencies (Docsy theme)
├── package.json           # Node.js dependencies (PostCSS)
├── postcss.config.js      # PostCSS / Autoprefixer config
├── content/               # Markdown documentation pages
├── layouts/               # Hugo layout overrides & custom shortcodes
│   ├── partials/          #   Reusable HTML partials
│   └── shortcodes/        #   architecture-diagram, callout, version-badge
├── static/                # Static assets (images, CSS, favicons)
├── assets/                # SCSS stylesheets and icons (Hugo Pipes)
├── public/                # Build output (git-ignored)
└── resources/             # Hugo resource cache
```

---

## Custom Shortcodes

This documentation site provides custom Hugo shortcodes for richer content:

| Shortcode | Purpose |
|-----------|---------|
| `architecture-diagram` | Renders architecture and system diagrams |
| `callout` | Styled callout boxes (info, warning, tip, danger) |
| `version-badge` | Displays version availability badges |

---

## Configuration

Key settings in `hugo.toml`:

| Setting | Value | Description |
|---------|-------|-------------|
| `baseURL` | `https://thunderdb.io/docs/` | Production site URL |
| `theme` | Docsy (via Hugo Modules) | Documentation theme |
| `offlineSearch` | `true` | Client-side search without external service |
| `prism_syntax_highlighting` | `false` | Uses Hugo's built-in Chroma highlighter |
| `highlight.style` | `dracula` | Syntax highlighting color scheme |
| `version` | `0.1.0` | Current documented release |

---

## Contributing

Contributions to the documentation are welcome. Here's how to get involved:

1. **Fork** the repository and create a feature branch.
2. **Make your changes** — all documentation lives in `content/`.
3. **Preview locally** with `hugo server` to verify rendering.
4. **Submit a pull request** against the `main` branch.

### Writing Guidelines

- Use standard Markdown with Hugo front matter (`title`, `weight`, `description`).
- Place new pages in the appropriate section under `content/docs/`.
- Use `weight` in front matter to control page ordering within sections.
- Include code examples with fenced code blocks and language identifiers.
- Use the custom shortcodes (`callout`, `version-badge`) where appropriate.

### Reporting Issues

Found an error or have a suggestion? [Open an issue](https://github.com/smetal1/thunder-db/issues/new) on the main repository.

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Static site generator | [Hugo](https://gohugo.io/) (extended) |
| Theme | [Google Docsy](https://www.docsy.dev/) v0.13.0 |
| CSS processing | [PostCSS](https://postcss.org/) + [Autoprefixer](https://github.com/postcss/autoprefixer) |
| Module system | Hugo Modules (Go-based) |
| Search | Offline / client-side (built-in) |
| Hosting | Static files — deployable anywhere |

---

## License

- **ThunderDB Core Engine** — [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- **ThunderDB Enterprise Features** — [Business Source License 1.1](https://mariadb.com/bsl11/) (converts to Apache 2.0 after 36 months)

Documentation content is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
