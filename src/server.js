const fs = require("fs");
const path = require("path");
const express = require("express");

const dataDir = path.join(__dirname, "data");
const PORT = process.env.PORT || 1337;


const readJson = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));

let books = readJson("books.json");
let authors = readJson("authors.json");
let publishers = readJson("publishers.json");


let writing = Promise.resolve();
const writeQueued = (file, data) => {
  writing = writing.then(
    () =>
      new Promise((res, rej) => {
        fs.writeFile(path.join(dataDir, file), JSON.stringify(data, null, 2), (err) =>
          err ? rej(err) : res()
        );
      })
  );
  return writing;
};

const app = express();
app.use(express.json());


app.get("/books", (req, res) => res.json(books));

app.get("/books/:id", (req, res) => {
  const id = Number(req.params.id);
  const book = books.find((b) => b.id === id);
  if (!book) return res.status(404).json({ error: "Book not found" });
  res.json(book);
});

app.post("/books", async (req, res) => {
  const b = req.body;
  if (!b?.id) return res.status(400).json({ error: "id is required" });
  if (books.some((x) => x.id === b.id)) return res.status(409).json({ error: "Book already exists" });
  books.push(b);
  await writeQueued("books.json", books);
  res.status(201).location(`/books/${b.id}`).json(b);
});

app.put("/books/:id", async (req, res) => {
  const id = Number(req.params.id);
  const idx = books.findIndex((b) => b.id === id);
  if (idx === -1) return res.status(404).json({ error: "Book not found" });
  const replacement = { ...req.body, id };
  books[idx] = replacement;
  await writeQueued("books.json", books);
  res.json(replacement);
});

app.patch("/books/:id", async (req, res) => {
  const id = Number(req.params.id);
  const idx = books.findIndex((b) => b.id === id);
  if (idx === -1) return res.status(404).json({ error: "Book not found" });
  books[idx] = { ...books[idx], ...req.body, id };
  await writeQueued("books.json", books);
  res.json(books[idx]);
});

app.delete("/books/:id", async (req, res) => {
  const id = Number(req.params.id);
  const before = books.length;
  authors = authors.map((a) => ({
    ...a,
    books: (a.books || []).filter((r) => r.book_id !== id),
  }));
  publishers = publishers.map((p) => ({
    ...p,
    books: (p.books || []).filter((r) => r.book_id !== id),
  }));
  books = books.filter((b) => b.id !== id);
  if (books.length === before) return res.status(404).json({ error: "Book not found" });
  await Promise.all([
    writeQueued("books.json", books),
    writeQueued("authors.json", authors),
    writeQueued("publishers.json", publishers),
  ]);
  res.status(204).end();
});

app.get("/authors", (req, res) => res.json(authors));

app.get("/authors/:id", (req, res) => {
  const id = Number(req.params.id);
  const a = authors.find((x) => x.id === id);
  if (!a) return res.status(404).json({ error: "Author not found" });
  res.json(a);
});

app.get("/authors/:id/books", (req, res) => {
  const id = Number(req.params.id);
  const a = authors.find((x) => x.id === id);
  if (!a) return res.status(404).json({ error: "Author not found" });
  const refs = a.books && a.books.length > 0
    ? a.books.map((r) => r.book_id)
    : books.filter((b) => b.author_id === id).map((b) => b.id);
  const full = books.filter((b) => refs.includes(b.id));
  res.json(full);
});

app.post("/authors", async (req, res) => {
  const a = req.body;
  if (!a?.id) return res.status(400).json({ error: "id is required" });
  if (authors.some((x) => x.id === a.id)) return res.status(409).json({ error: "Author already exists" });
  authors.push({ ...a, books: a.books || [] });
  await writeQueued("authors.json", authors);
  res.status(201).location(`/authors/${a.id}`).json(a);
});

app.put("/authors/:id", async (req, res) => {
  const id = Number(req.params.id);
  const idx = authors.findIndex((x) => x.id === id);
  if (idx === -1) return res.status(404).json({ error: "Author not found" });
  authors[idx] = { ...req.body, id, books: req.body.books || [] };
  await writeQueued("authors.json", authors);
  res.json(authors[idx]);
});

app.patch("/authors/:id", async (req, res) => {
  const id = Number(req.params.id);
  const idx = authors.findIndex((x) => x.id === id);
  if (idx === -1) return res.status(404).json({ error: "Author not found" });
  authors[idx] = { ...authors[idx], ...req.body, id };
  await writeQueued("authors.json", authors);
  res.json(authors[idx]);
});

app.delete("/authors/:id", async (req, res) => {
  const id = Number(req.params.id);
  const before = authors.length;
  authors = authors.filter((x) => x.id !== id);
  if (authors.length === before) return res.status(404).json({ error: "Author not found" });
  // Quitar asociación desde books
  books = books.map((b) => (b.author_id === id ? { ...b, author_id: null } : b));
  await Promise.all([
    writeQueued("authors.json", authors),
    writeQueued("books.json", books),
  ]);
  res.status(204).end();
});

app.put("/authors/:id/books", async (req, res) => {
  const id = Number(req.params.id);
  const { book_id, title } = req.body || {};
  const aIdx = authors.findIndex((x) => x.id === id);
  if (aIdx === -1) return res.status(404).json({ error: "Author not found" });
  if (!book_id) return res.status(400).json({ error: "book_id is required" });

  const bIdx = books.findIndex((b) => b.id === Number(book_id));
  if (bIdx === -1) return res.status(404).json({ error: "Book not found" });


  books[bIdx] = { ...books[bIdx], author_id: id };

  const arr = authors[aIdx].books || [];
  if (!arr.some((r) => r.book_id === Number(book_id))) {
    arr.push({ book_id: Number(book_id), title: title || books[bIdx].title });
    authors[aIdx].books = arr;
  }
  await Promise.all([
    writeQueued("books.json", books),
    writeQueued("authors.json", authors),
  ]);
  res.json(authors[aIdx]);
});

app.get("/publishers", (req, res) => res.json(publishers));

app.get("/publishers/:id", (req, res) => {
  const id = Number(req.params.id);
  const p = publishers.find((x) => x.id === id);
  if (!p) return res.status(404).json({ error: "Publisher not found" });
  res.json(p);
});

app.get("/publishers/:id/books", (req, res) => {
  const id = Number(req.params.id);
  const p = publishers.find((x) => x.id === id);
  if (!p) return res.status(404).json({ error: "Publisher not found" });
  const refs = p.books && p.books.length > 0
    ? p.books.map((r) => r.book_id)
    : books.filter((b) => b.publisher_id === id).map((b) => b.id);
  const full = books.filter((b) => refs.includes(b.id));
  res.json(full);
});

app.post("/publishers", async (req, res) => {
  const p = req.body;
  if (!p?.id) return res.status(400).json({ error: "id is required" });
  if (publishers.some((x) => x.id === p.id)) return res.status(409).json({ error: "Publisher already exists" });
  publishers.push({ ...p, books: p.books || [] });
  await writeQueued("publishers.json", publishers);
  res.status(201).location(`/publishers/${p.id}`).json(p);
});

app.put("/publishers/:id", async (req, res) => {
  const id = Number(req.params.id);
  const idx = publishers.findIndex((x) => x.id === id);
  if (idx === -1) return res.status(404).json({ error: "Publisher not found" });
  publishers[idx] = { ...req.body, id, books: req.body.books || [] };
  await writeQueued("publishers.json", publishers);
  res.json(publishers[idx]);
});

app.patch("/publishers/:id", async (req, res) => {
  const id = Number(req.params.id);
  const idx = publishers.findIndex((x) => x.id === id);
  if (idx === -1) return res.status(404).json({ error: "Publisher not found" });
  publishers[idx] = { ...publishers[idx], ...req.body, id };
  await writeQueued("publishers.json", publishers);
  res.json(publishers[idx]);
});

app.delete("/publishers/:id", async (req, res) => {
  const id = Number(req.params.id);
  const before = publishers.length;
  publishers = publishers.filter((x) => x.id !== id);
  if (publishers.length === before) return res.status(404).json({ error: "Publisher not found" });
  books = books.map((b) => (b.publisher_id === id ? { ...b, publisher_id: null } : b));
  await Promise.all([
    writeQueued("publishers.json", publishers),
    writeQueued("books.json", books),
  ]);
  res.status(204).end();
});

app.put("/publishers/:id/books", async (req, res) => {
  const id = Number(req.params.id);
  const { book_id, title } = req.body || {};
  const pIdx = publishers.findIndex((x) => x.id === id);
  if (pIdx === -1) return res.status(404).json({ error: "Publisher not found" });
  if (!book_id) return res.status(400).json({ error: "book_id is required" });
  const bIdx = books.findIndex((b) => b.id === Number(book_id));
  if (bIdx === -1) return res.status(404).json({ error: "Book not found" });

  books[bIdx] = { ...books[bIdx], publisher_id: id };
  const arr = publishers[pIdx].books || [];
  if (!arr.some((r) => r.book_id === Number(book_id))) {
    arr.push({ book_id: Number(book_id), title: title || books[bIdx].title });
    publishers[pIdx].books = arr;
  }
  await Promise.all([
    writeQueued("books.json", books),
    writeQueued("publishers.json", publishers),
  ]);
  res.json(publishers[pIdx]);
});

app.get("/book", (req, res) => res.json(books));
app.get("/book/:id", (req, res) => {
  const id = Number(req.params.id);
  const book = books.find((b) => b.id === id);
  if (!book) return res.status(404).send("Book not found");
  res.json(book);
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));