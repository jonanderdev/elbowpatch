<div align="center">
  <p><img src="docs/brand/logo.svg" alt="Elbowpatch" width="200"></p>
  <p><strong>Elbowpatch</strong></p>
  <p><strong>A quiet place to write, with a memory. <br/> Local-first and private: your words stay with you, and every draft is kept safe.</strong></p>
</div>

***

Elbowpatch is a writing app for journals, essays and books. It opens on one page and nothing else, like a book you are writing in.  
Behind that page it quietly remembers every moment of your writing, so you can walk back through it and bring back anything you lost, with no save button and no version control to learn.

It runs in the browser, installs on phone, tablet or desktop, and works offline.  
Your writing stays on your device as plain Markdown and goes nowhere unless you choose a place to keep a copy.

Read **[why we are building it](MANIFESTO.md)**.

## The goal

A writing tool you want to open every day, that never loses a word, and that leaves your files in your own hands.  
Other apps get one or two of these right. Elbowpatch tries to do all of them in one small app:

- **A quiet page.** One column, good type, pages that fill and turn like a book. Tools stay hidden until you ask for them.
- **A history you can walk through.** Every moment is kept automatically. Look back, bring a chapter or a day back, keep a copy to try something different. Nothing is ever deleted.
- **Your own files.** Plain Markdown, all of it exportable in one click. Sync, when it comes, goes only to a place you connect.
- **Everywhere, free forever.** An installable web app with no server of its own, so anyone can host it. No subscription, now or later.
- **Your own words.** No AI writing for you. A calm place to be creative on your own.

## Status

Early and in progress. The first version is being built and used daily by its maintainer before anyone else is asked to rely on it.  
Not ready for writing you cannot afford to lose yet.

## Trying it

You need [Node.js](https://nodejs.org) (version 24 or newer, as set in `app/package.json`). The app lives in [`app/`](app/).

**Run it on your computer:**

```sh
cd app
npm install
npm run dev
```

Then open http://localhost:5173 in your browser and start writing.

**Host your own copy:** run `npm run build` in `app/`. It creates a `dist/` folder of plain files with no server needed, which you can upload to any static host.

The other scripts (tests, lint, typecheck) are listed in [`app/package.json`](app/package.json).

## Learn more

- [MANIFESTO.md](MANIFESTO.md): why this exists and what it will never do.
- [PROJECT.md](PROJECT.md): the full idea, scope and architecture.
- [DESIGN.md](DESIGN.md): the look, with the screens in Figma.
- [docs/decisions/](docs/decisions/): the choices we made and why.

Open source under the [MIT License](LICENSE). Provided as-is, without warranty of any kind. See [CONTRIBUTING.md](CONTRIBUTING.md) if you would like to help.
