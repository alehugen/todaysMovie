# The machine learning pipeline

A walkthrough of what happens between "the user taps a thumbs up" and "a movie
appears on screen tomorrow morning". Read top to bottom; each section maps to one
file.

## The problem, stated precisely

**Binary classification, one model per user, trained in the browser.**

Given a movie described by a handful of attributes, predict the probability that
this specific person will like it. Rank candidates by that probability.

Every constraint that follows comes from one number: **a user produces about
twenty labelled examples**. Not twenty thousand. Twenty. That single fact explains
the small network, the heavy regularisation, the cross-validation, and why most
"improvements" turned out to be worthless.

## The flow

```
  user rates a movie
         │
         ▼
  ┌──────────────────┐   features.js      raw JSON → 20 numbers in 0..1
  │ 1. FEATURES      │
  └──────────────────┘
         │  X = [[…20 numbers…], …]   y = [1, 0, 1, 1, 0, …]
         ▼
  ┌──────────────────┐   model.js         20 → 16 ReLU → dropout → 1 sigmoid
  │ 2. MODEL         │                    binary cross-entropy, Adam, class weights
  └──────────────────┘
         │
         ▼
  ┌──────────────────┐   trainingRunner.js  evaluate → train → save
  │ 3. ORCHESTRATION │                      (runs inside trainer.worker.js)
  └──────────────────┘
         │  model in IndexedDB
         ▼
  ┌──────────────────┐   inference.js     probability per candidate
  │ 4. SCORING       │
  └──────────────────┘
         │
         ▼
  ┌──────────────────┐   ranking.js       sort, break ties, enforce diversity
  │ 5. RANKING       │
  └──────────────────┘
         │
         ▼
  ┌──────────────────┐   dailySelection.js  4 exploit + 1 explore, fixed per day
  │ 6. DAILY PICK    │
  └──────────────────┘
         │
         ▼
  ┌──────────────────┐   confidence.js    should the user trust this?
  │ 7. TRUST         │
  └──────────────────┘
```

## 1. Features — `features.js`

A network reads vectors, not JSON. Twenty numbers per movie, every one in `0..1`:

| Block | Size | Encoding |
| --- | --- | --- |
| Genres | 13 | multi-hot, plus an `other` slot |
| Age rating | 1 | ordinal (`G` → 0 … `NC-17` → 1) |
| Year, runtime, IMDb rating, log(votes) | 4 | min-max with fixed bounds |
| Declared genre match, nostalgia fit | 2 | derived from the user profile |

Four decisions worth defending out loud:

**Multi-hot, not label encoding.** Numbering genres 1–12 would tell the network
that Horror > Drama and that Comedy is the average of Action and Drama. Unordered
categories get one column each.

**Ordinal for age ratings.** These *do* have an order, so one dimension suffices
instead of ten. Dimensions are expensive at this dataset size.

**Log for vote counts.** Counts are heavy-tailed. Without `log10`, 5,000 votes
normalises to 0.002 and 2.5 million to 1.0 — 99% of the catalog collapses into the
same value and every distinction in the lower range is destroyed.

**Fixed normalisation bounds, not statistics from the data.** A movie runs 45–210
minutes; IMDb ratings go 1–10. Those are facts about cinema. Computing min/max from
the dataset would leak information from the evaluation split into training *and*
rescale every previous vector whenever a new rating arrives.

Missing values become `null` during parsing, never `0` or `NaN`, and are imputed
with a neutral domain default. A single `NaN` turns the whole loss into `NaN`.

## 2. Model — `model.js`

```
20 inputs → 16 ReLU + dropout(0.15) → 1 sigmoid     ≈ 350 parameters
loss: binary cross-entropy   optimiser: Adam(0.01)   class weights: balanced
```

**Why so small.** More parameters than data points means the network can memorise
the training set and generalise nothing. Three brakes: few units, L2 (large weights
become expensive, so the decision spreads across features), and dropout (no single
unit becomes "the Sci-Fi specialist").

**Why sigmoid + cross-entropy.** Sigmoid gives a probability, which is what lets
candidates be ranked. Cross-entropy's penalty grows without bound with confident
mistakes — predicting 0.01 when the answer is 1 costs ≈ 4.6, predicting 0.5 costs
0.69 — which is what teaches the model to hedge rather than guess loudly.

**Class weights.** The questionnaire shows mostly favourite-genre movies, so users
like most of them. On a 15-likes/5-dislikes dataset, "answer liked to everything"
scores 75%. Weighting by inverse class frequency removes that shortcut.

### Three subtle things in this file

**Shuffle before `fit`.** TensorFlow's `validationSplit` takes the *last* fraction
of the array as-is, and its own `shuffle: true` runs *after* the cut. With the
questionnaire's fixed presentation order, skipping the manual shuffle means the
validation set is a biased slice of the end of the list — possibly single-class.

**Early stopping written by hand.** `tf.callbacks.earlyStopping` declares
`restoreBestWeights` in its typings and throws "not implemented" at runtime, and
mixing native callbacks with plain-object ones breaks TensorFlow.js's conversion.
Without weight restoration, early stopping halts training but leaves the model
`patience` epochs past its best point. So: snapshot on improvement, stop after 25
epochs without, restore the snapshot.

**Tensor memory.** TensorFlow.js tensors live outside the JavaScript heap, so the
garbage collector cannot see them. Everything is disposed in a `finally`, and
inference runs inside `tf.tidy` with results converted to plain arrays before
leaving the scope.

### Evaluation, honestly

Accuracy alone is a liar on unbalanced data. The reported numbers are:

- **balanced accuracy** — the mean of per-class recall; a majority-class guesser
  scores exactly 50%;
- **recall per class** — a `recallPositive` of 50% means half the movies the user
  would have loved never surface, which is invisible in accuracy and fatal here;
- **the majority baseline** — the score of the trivial strategy the model must beat;
- **the confusion matrix**.

The estimate comes from **repeated stratified k-fold cross-validation**. With 20
examples, holding out 5 is close to a coin toss. Cross-validation predicts every
example once with a model that never saw it. The repetition is not cosmetic:
measured on a single fixed dataset, one partition reported 72% where the average
over three partitions reported 62.5%. That is bias, not noise.

## 3. Orchestration — `trainingRunner.js`

`evaluate → train → save`, in that order, with progress reported at each phase.
Evaluation runs first because "should the user trust this?" must not be answered by
the model being shipped.

The file contains no Worker API at all. That is deliberate: jsdom cannot execute a
real Worker, so all the logic lives here where it can be unit-tested, and
`trainer.worker.js` stays a shell thin enough to be obviously correct.

## 4 & 5. Scoring and ranking — `inference.js`, `ranking.js`

The model is cached in the worker's memory between calls and **invalidated right
after every training run**. Forgetting that invalidation is a bug with no symptom:
the user retrains and keeps getting the old recommendations, silently.

Ranking applies two corrections to raw probabilities:

**Tie-breaking.** A confident model saturates its sigmoid; the top five candidates
come back as `0.999x` and are effectively tied. Shuffling before a stable sort makes
tied items come out in random order while real differences still sort correctly.
Without it, the "movie of the day" would be the same title forever.

**Diversity (MMR).** The five best-scored movies are usually five versions of the
same movie. Maximal Marginal Relevance picks one at a time, maximising
`λ · score − (1 − λ) · similarity to what is already picked`. The first pick has
nothing to be similar to, so the daily highlight is never penalised — only the
alternatives are. This is the recommender-system cousin of non-maximum suppression
in object detection.

## 6. Daily pick — `dailySelection.js`

Four slots **exploit** what the model believes; one slot **explores** — a movie
drawn at random regardless of score, flagged as a wildcard.

Giving a slot away to chance is deliberate. A model trained on 20 examples is very
likely wrong about an entire genre, and a recommender that only shows what it
already approves of never discovers that. This is ε-greedy, the simplest
multi-armed-bandit strategy. Exploration is never wasted either: a rejected wildcard
produces a negative training example, and negatives are exactly what the
questionnaire is short of.

The selection is stored under the **local** calendar date, so refreshing does not
reshuffle it. Using UTC would flip the movie at 9 p.m. for a user at UTC−3.

## 7. Trust — `confidence.js`

Object detectors stay silent below a confidence threshold, because a confident
wrong answer is worse than no answer. Same principle here.

The thresholds were calibrated from measurements — the model's real working range
is 60–78% balanced accuracy — rather than guessed. An earlier version treated
"below 60%" as failure, which labelled normal behaviour as a problem.

`unknown` is kept distinct from `low` on purpose: "the model is bad" and "I cannot
tell yet whether the model is bad" are different statements, and a model reporting
90% from four predictions is not good, it is unmeasured.

## What the measurements actually said

| Change | Effect on balanced accuracy |
| --- | --- |
| Hidden units 4 → 32, and two hidden layers | ~0 pp |
| 24 combinations of dropout, L2, learning rate | all within 68–73%, i.e. noise |
| Taste-centroid features | +0.4 pp → disabled |
| TF-IDF plot-similarity features | +2.2 / +1.1 / −0.4 pp → disabled, inconclusive |
| **Class balance in the sample (25% → 40% outside genres)** | **+10 pp** |
| **Training examples 16 → 24** | **+15 pp** |

The pattern is the whole lesson: **nothing done to the model competes with more
labelled data or a better-balanced sample.** That is why the daily feedback loop —
every thumbs up or down becoming a new example — matters more than any architecture
decision in this repository.

## Deliberately not done

- **Collaborative filtering.** With one local user there is no cross-user signal,
  so "people who liked X also liked Y" is unavailable by construction.
- **Sentence embeddings.** They would add genuinely new information that the 20
  features do not carry, at the cost of a ~25 MB runtime download — a hard network
  dependency in an app whose premise is that everything runs locally.
- **A bigger network.** Measured, repeatedly, and it does not help at this data size.
