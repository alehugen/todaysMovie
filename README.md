# Today's Movie

A movie recommender that trains a neural network **in your browser**, from your own ratings.
No account, no backend, no data leaving your machine.

Built with Vue 3, Tailwind CSS v4 and TensorFlow.js. Movie data comes from the
[OMDb API](https://www.omdbapi.com/).

---

## What it does

1. **You answer a short questionnaire** — your birth year, your favourite genres, and thumbs up or
   down on 20 movies picked to span every decade you have lived through.
2. **A model is trained locally** in a Web Worker: a small neural network that learns to predict
   whether you will like a movie from its genres, era, runtime, rating and audience size.
3. **Every day you get one pick**, plus four alternatives. The choice is deterministic per calendar
   day, so refreshing does not reshuffle it.
4. **Your answers feed the model back.** Each thumbs up or down becomes a new training example, and
   nothing you have already seen is ever recommended twice.
5. **The catalog grows by itself**, discovering new movies from OMDb in a background worker so the
   app never runs out of things to suggest.

## Why it is more than a tutorial project

The interesting part is not that it uses a neural network — it is that **every design decision was
measured instead of guessed**, and the measurements are reported honestly, including the ones that
did not work.

### Things that were measured and kept

| Change | Effect on balanced accuracy |
| --- | --- |
| Balancing the training set (`outsideRatio` 0.25 → 0.40) | **+10 pp** |
| More training examples (16 → 24 ratings) | **+15 pp** |
| Dropping the year filter in catalog discovery | **10× fewer API calls per usable movie** |

### Things that were measured and rejected

| Change | Effect | Decision |
| --- | --- | --- |
| Bigger network (4 → 32 units, and two hidden layers) | ~0 pp across the board | kept the small model |
| 24 combinations of dropout, L2 and learning rate | all within 68–73%, i.e. noise | kept sensible defaults |
| Profile-informed features (declared genres, nostalgia curve) | +0.4 to −3.0 pp | kept, flagged as unproven |
| Taste-centroid features (average of what you liked) | +0.4 pp | **implemented, then disabled by default** |
| TF-IDF plot-similarity features | +2.2 / +1.1 / −0.4 pp | implemented, disabled — see below |

The taste-centroid work lives in [`src/ml/taste.js`](src/ml/taste.js) with its full test suite. It is
switched off because the measurement did not justify it, not because it was too hard — the code
handles two subtle data-leakage traps described below.

The plot-similarity work in [`src/ml/plotText.js`](src/ml/plotText.js) is a different case and worth
being precise about: the benchmark that produced those numbers was **under-powered**. The synthetic
taste signal it planted in the plots was present in only 19 of 182 movies, so a 16-movie sample
contained one or two examples of it. The result is therefore **inconclusive rather than negative**,
and the feature is off until a properly calibrated experiment says otherwise.

> The lesson the numbers keep repeating: **no amount of model tuning competes with more labelled
> data.** That is why the daily feedback loop matters more than the architecture.

## The machine learning pipeline

> A step-by-step walkthrough of the pipeline, written to be explained out loud,
> lives in [`src/ml/README.md`](src/ml/README.md).

```
OMDb JSON            "Runtime": "142 min"   "imdbVotes": "2,800,000"   "Metascore": "N/A"
      ↓ normalisation
typed values         142                    2800000                    null
      ↓ feature engineering
feature vector       [0,1,0,…,0.85,0.75,0.86,0.88,1,0.94]   ← 20 numbers, all in 0..1
      ↓ Web Worker
training             20 → 16 → 1, ReLU + dropout + L2, binary cross-entropy, Adam
      ↓ IndexedDB
saved model          reloaded on the next visit without retraining
      ↓
scoring              every candidate gets a probability, then ranked
```

### Feature engineering

Twenty features, all clamped to `0..1`, defined in [`src/ml/features.js`](src/ml/features.js):

- **13 multi-hot genre slots** (12 genres plus an `other` escape hatch). Multi-hot, not one-hot — a
  movie has several genres at once.
- **1 ordinal maturity score** (`G` → 0, `PG-13` → 0.5, `R` → 0.8). Age ratings have a natural
  order, so they cost one dimension instead of ten.
- **4 numeric features**: year, runtime, IMDb rating and a **log-scaled** vote count. Votes follow a
  heavy-tailed distribution — without `log10`, 99% of movies collapse into the same value.
- **2 profile features**: how many of your declared genres the movie matches, and a Gaussian
  "reminiscence bump" centred on the age of 17 — a deliberately **non-linear** function of the
  release year, which is why it is not redundant with the year feature.

Normalisation uses **fixed domain bounds** (a movie lasts between 45 and 210 minutes; IMDb ratings
run from 1 to 10) rather than statistics computed from the data. That removes an entire class of
data leakage by construction, and keeps the scale stable when a single new rating arrives.

Missing values are never `0` or `NaN`. They become `null` during parsing and are then imputed with a
neutral domain default, so "no Metascore" never reads as "terrible movie".

### Honest evaluation

Accuracy alone is misleading when the classes are unbalanced — a model that answers "no" to
everything scores 70% on a dataset that is 70% negative. The app therefore reports:

- **balanced accuracy** (the mean of per-class recall),
- **per-class recall**, so a majority-class guesser cannot hide,
- the **majority-class baseline** it has to beat,
- and a **confusion matrix**.

Estimates come from **repeated stratified k-fold cross-validation**. Repetition matters: a single
fixed partition was measured to be biased by up to 10 pp on the same dataset, because the harder
examples can all land in the training side by chance.

The measured working range is 60–78% balanced accuracy, so the UI thresholds were calibrated from
those numbers rather than from intuition. The app only warns you when the model is genuinely
struggling, instead of nagging while it is performing normally.

### Data leakage, handled in three places

1. **Normalisation** uses fixed constants, never statistics from the dataset.
2. **Cross-validation folds** rebuild every derived statistic from the training fold only.
3. **Leave-one-out centroids**: when a movie contributes to the "movies you liked" centroid, its own
   similarity to that centroid is inflated — a mismatch with inference, where a candidate belongs to
   no centroid. Each training row therefore gets a centroid computed without itself.

That third one is guarded by a test named `never lets a movie help build its own centroid`.

## Architecture

```
src/
├── components/     presentational only — props in, events out
├── composables/    reactive logic: storage, theme, search, onboarding, worker RPC
├── layouts/        app shell
├── router/         routes plus a single testable navigation guard
├── stores/         Pinia: the user profile, persisted to localStorage
├── views/          one per route
├── services/       plain functions, no Vue: OMDb client, cache, sampler, catalog builder
├── ml/             plain functions, no Vue: features, model, training, inference, ranking
└── data/           the seed catalog (182 verified movies)
```

**Nothing in `services/` or `ml/` imports Vue.** That is what lets both run unchanged inside Web
Workers, and it is what makes them testable without mounting a single component.

### Two workers, on purpose

| Worker | Size | Job |
| --- | --- | --- |
| `trainer.worker.js` | ~1.6 MB | training and inference (carries TensorFlow.js) |
| `catalog.worker.js` | ~5 kB | discovering new movies on OMDb |

Splitting them keeps TensorFlow.js out of the catalog path entirely. The **main bundle stays at
~110 kB** because the main thread never imports TensorFlow.js at all: it sends arrays of numbers to
the worker and receives arrays of numbers back.

Both workers speak the same tiny RPC protocol — every request carries an `id`, so answers can arrive
out of order without being mixed up. The client lives in
[`src/composables/useWorkerRpc.js`](src/composables/useWorkerRpc.js).

### Working around the OMDb API

OMDb has no browse or discovery endpoint, and it **returns HTTP 200 even when it fails**:

```json
{ "Response": "False", "Error": "Invalid API key!" }
```

So the client inspects the body, not just the status code, and maps OMDb's human-written messages to
stable error codes. The catalog is seeded from 182 hand-picked IDs that were each verified against
the live API, then grown at runtime by searching common title words and filtering results by vote
count, rating and type.

Movie details are cached in IndexedDB with a **24-hour TTL** — long enough to save quota, short
enough that vote counts and ratings stay current.

## Running it

```bash
npm install
cp .env.example .env.local     # then paste your free OMDb key
npm run dev
```

Get a free key at [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx). The key arrives by
email with an activation link that must be clicked before it works.

```bash
npm run test        # watch mode
npm run test:run    # single run — 279 tests
npm run coverage
npm run build
```

## Stack

| | |
| --- | --- |
| UI | Vue 3 (Composition API), Vue Router, Pinia |
| Styling | Tailwind CSS v4 with a three-layer token design system |
| ML | TensorFlow.js 4 |
| Build | Vite 8 |
| Tests | Vitest (jsdom), 279 tests |
| Storage | `localStorage` for the profile, IndexedDB for the movie cache and the model |

The design system is worth a look: primitives → semantic tokens → utilities. Dark mode works with
**zero `dark:` classes in any component**, and every colour pair was checked against WCAG AA before
being used — one candidate palette failed by 0.03 and was replaced.

## Known limitations

- **Cold start is real.** Below roughly 20 ratings the model is only slightly better than guessing.
  The app says so instead of pretending otherwise.
- **Content-based only.** With a single local user there is no collaborative signal, so the model
  cannot learn "people who liked X also liked Y".
- **The free OMDb tier allows 1,000 requests a day**, which shapes the caching and discovery budget.
- **Plot text is only partly exploited.** A TF-IDF pipeline exists and is tested, but it is disabled
  pending a better-powered experiment. Sentence embeddings would extract far more from the same text
  at the cost of a ~25 MB model download.

## Author

Alessandro Hugen — [LinkedIn](https://www.linkedin.com/in/alehugen)
