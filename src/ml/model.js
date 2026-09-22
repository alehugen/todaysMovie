/**
 * STEP 2 OF THE PIPELINE — THE MODEL
 *
 * Builds, trains, evaluates and persists the network. Everything here is a binary
 * classifier: given one movie's feature vector, output the probability that this
 * particular user will like it. That probability is what ranks the daily pick.
 *
 * The constraint that shapes every decision in this file is the size of the
 * dataset. A user who answers the questionnaire produces ~20 labelled examples.
 * Twenty. That is why the network is tiny, heavily regularised, and evaluated with
 * cross-validation rather than a single held-out split.
 */

import * as tf from '@tensorflow/tfjs'

import { FEATURE_COUNT } from './features'
import { augmentCandidates, augmentTrainingSet, buildTasteProfile } from './taste'

// The model is stored in IndexedDB rather than localStorage for two reasons:
// Web Workers cannot access localStorage at all, and localStorage shares a ~5 MB
// budget with the movie cache.
export const MODEL_STORAGE_URL = 'indexeddb://todaysmovie-model'

/**
 * Every value here was chosen by measurement, not intuition. Sweeping 4 to 32
 * hidden units, one and two hidden layers, and 24 combinations of dropout, L2 and
 * learning rate all landed within noise of each other (68–73% balanced accuracy).
 * What actually moved the needle was more labelled data and a better class balance.
 *
 * So: a deliberately small model, and effort spent elsewhere.
 */
export const DEFAULT_TRAINING_OPTIONS = {
  hiddenUnits: 16,
  l2: 0.001,
  dropout: 0.15,
  learningRate: 0.01,
  epochs: 200,
  batchSize: 8,
  patience: 25,
  validationSplit: 0.2,
  minSamplesForValidation: 16,
}

/**
 * ARCHITECTURE:  20 inputs → 16 ReLU units → dropout → 1 sigmoid output
 *
 * That is ~350 parameters learning from ~20 examples. With more parameters than
 * data points, the network can simply MEMORISE the training set and generalise
 * nothing, so three brakes are applied:
 *
 *   - few units: limits how much it can memorise;
 *   - L2 regularisation: adds the squared weights to the loss, making large
 *     weights expensive and forcing the decision to spread across features
 *     instead of betting everything on one;
 *   - dropout: randomly switches off a fraction of units each step, so no single
 *     unit can become "the Sci-Fi specialist" and redundancy is forced.
 *
 * Output layer:
 *   - `sigmoid` squeezes any real number into 0..1, so the output reads as a
 *     probability and candidates can be ranked by it.
 *   - `binaryCrossentropy` is the matching loss. Unlike mean squared error, its
 *     penalty grows without bound as confidence in a wrong answer increases:
 *     predicting 0.01 when the answer is 1 costs -ln(0.01) ≈ 4.6, predicting 0.5
 *     costs 0.69. That is what teaches the model to hedge instead of guessing
 *     loudly.
 *   - `adam` adapts the learning rate per parameter, which helps here because the
 *     inputs have very different characters: the genre columns are sparse and
 *     binary, the numeric ones are dense and continuous.
 *
 * `seed` makes weight initialisation reproducible, which is what allows the tests
 * and the experiments to be deterministic.
 */
export function createModel({
  inputSize = FEATURE_COUNT,
  hiddenUnits = DEFAULT_TRAINING_OPTIONS.hiddenUnits,
  l2 = DEFAULT_TRAINING_OPTIONS.l2,
  dropout = DEFAULT_TRAINING_OPTIONS.dropout,
  learningRate = DEFAULT_TRAINING_OPTIONS.learningRate,
  seed,
} = {}) {
  const model = tf.sequential()
  const layerSizes = Array.isArray(hiddenUnits) ? hiddenUnits : [hiddenUnits]

  layerSizes.forEach((units, index) => {
    model.add(
      tf.layers.dense({
        // Only the first layer declares the input shape; the rest infer it.
        ...(index === 0 ? { inputShape: [inputSize] } : {}),
        units,
        activation: 'relu',
        kernelRegularizer: tf.regularizers.l2({ l2 }),
        kernelInitializer: tf.initializers.glorotUniform({ seed }),
      }),
    )

    model.add(tf.layers.dropout({ rate: dropout, seed }))
  })

  model.add(
    tf.layers.dense({
      units: 1,
      activation: 'sigmoid',
      kernelInitializer: tf.initializers.glorotUniform({ seed }),
    }),
  )

  model.compile({
    optimizer: tf.train.adam(learningRate),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy'],
  })

  return model
}

/**
 * CLASS WEIGHTS — the fix for an unbalanced dataset.
 *
 * The questionnaire shows mostly movies from the user's favourite genres, so they
 * tend to like most of them. A dataset of 15 likes and 5 dislikes lets the model
 * score 75% accuracy by answering "liked" to everything — a useless model with a
 * respectable-looking number.
 *
 * Weighting each example by the inverse frequency of its class multiplies the loss
 * of the rare class, which is equivalent to showing it more often:
 *
 *     weight(class) = total / (2 × count(class))
 *
 * This is the `balanced` formula from scikit-learn. Returns `undefined` when one
 * class is missing entirely, because there is nothing to balance — and a model
 * trained on a single class cannot learn anything anyway.
 */
export function computeClassWeight(labels) {
  const positives = labels.filter((label) => label === 1).length
  const negatives = labels.length - positives
  if (positives === 0 || negatives === 0) return undefined

  return {
    0: labels.length / (2 * negatives),
    1: labels.length / (2 * positives),
  }
}

/**
 * Fisher-Yates shuffle over an index array, so that each feature vector stays glued
 * to its own label. Shuffling the two arrays independently would silently destroy
 * the correspondence between input and answer, and nothing would report an error.
 *
 * This runs BEFORE `fit`, and that ordering is critical — see `trainModel`.
 */
export function shuffleDataset({ features, labels }, random = Math.random) {
  const order = features.map((_, index) => index)

  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const temporary = order[index]
    order[index] = order[swapIndex]
    order[swapIndex] = temporary
  }

  return {
    features: order.map((index) => features[index]),
    labels: order.map((index) => labels[index]),
  }
}

/**
 * Trains one model and returns it along with the numbers the UI needs.
 */
export async function trainModel(dataset, options = {}) {
  const settings = { ...DEFAULT_TRAINING_OPTIONS, ...options }
  const { random = Math.random, onEpochEnd, model: providedModel, seed } = options

  if (dataset.labels.length === 0) throw new Error('Cannot train on an empty dataset.')

  /**
   * Shuffling here, before `fit`, is not optional.
   *
   * TensorFlow's `validationSplit` takes the LAST fraction of the array as-is, and
   * its own `shuffle: true` only shuffles what is left for training — it runs after
   * the cut. The questionnaire presents movies in a fixed order, so without this
   * line the validation set would be a biased slice of the end of the list, and in
   * the worst case could contain a single class.
   */
  const shuffled = shuffleDataset(dataset, random)

  // Below ~16 examples a 20% validation split is 3 movies, which measures nothing.
  // In that case training runs for a fixed number of epochs with no early stopping.
  const useValidation = shuffled.labels.length >= settings.minSamplesForValidation

  // The input width comes from the data, not from a constant, because optional
  // similarity features can widen the vector.
  const model =
    providedModel ?? createModel({ ...settings, inputSize: shuffled.features[0].length, seed })

  const inputs = tf.tensor2d(shuffled.features)
  const targets = tf.tensor2d(shuffled.labels, [shuffled.labels.length, 1])

  const callbacks = []
  let bestValidationLoss = Number.POSITIVE_INFINITY
  let bestWeights = null
  let epochsWithoutImprovement = 0

  /**
   * EARLY STOPPING, written by hand on purpose.
   *
   * `tf.callbacks.earlyStopping` exists, but two of its behaviours made it unusable
   * here: `restoreBestWeights` is declared in the typings and throws
   * "not implemented" at runtime, and mixing a native callback with plain-object
   * callbacks breaks TensorFlow.js's callback conversion.
   *
   * Without weight restoration, early stopping is only half a solution: it halts
   * training but leaves the model with the weights from the LAST epoch, which is
   * `patience` epochs past the best one.
   *
   * So: snapshot the weights whenever validation loss improves, stop after
   * `patience` epochs with no improvement, and restore the best snapshot at the
   * end. `model.stopTraining = true` is the Keras-inherited way to break the loop
   * from inside a callback.
   */
  if (useValidation) {
    callbacks.push({
      onEpochEnd: (_epoch, logs) => {
        const validationLoss = logs?.val_loss
        if (!Number.isFinite(validationLoss)) return

        if (validationLoss < bestValidationLoss) {
          bestValidationLoss = validationLoss
          epochsWithoutImprovement = 0
          bestWeights?.forEach((weight) => weight.dispose())
          bestWeights = model.getWeights().map((weight) => weight.clone())
          return
        }

        epochsWithoutImprovement += 1
        if (epochsWithoutImprovement >= settings.patience) model.stopTraining = true
      },
    })
  }

  // The caller's progress callback (used to drive the progress bar via postMessage).
  if (onEpochEnd) callbacks.push({ onEpochEnd })

  try {
    const history = await model.fit(inputs, targets, {
      epochs: settings.epochs,
      batchSize: Math.min(settings.batchSize, shuffled.labels.length),
      shuffle: true,
      validationSplit: useValidation ? settings.validationSplit : 0,
      classWeight: computeClassWeight(shuffled.labels),
      callbacks,
      verbose: 0,
    })

    if (bestWeights) model.setWeights(bestWeights)

    return {
      model,
      epochsRun: history.epoch.length,
      bestValidationLoss: Number.isFinite(bestValidationLoss) ? bestValidationLoss : null,
      usedValidation: useValidation,
      finalLoss: history.history.loss.at(-1),
      finalAccuracy: history.history.acc?.at(-1) ?? history.history.accuracy?.at(-1) ?? null,
      finalValidationLoss: history.history.val_loss?.at(-1) ?? null,
    }
  } finally {
    /**
     * TENSOR MEMORY.
     *
     * TensorFlow.js tensors live outside the JavaScript heap (in WebGL memory or
     * its own buffers), so the garbage collector does not know they exist. Anything
     * not disposed leaks, and an app that retrains daily would grow without bound.
     * The `finally` guarantees cleanup even if training throws.
     */
    bestWeights?.forEach((weight) => weight.dispose())
    inputs.dispose()
    targets.dispose()
  }
}

/**
 * Runs the model over many movies at once and returns plain JavaScript numbers.
 *
 * `tf.tidy` automatically disposes every tensor created inside it except the return
 * value. `Array.from(outputs.dataSync())` converts to a normal array BEFORE leaving
 * the tidy scope — returning the tensor itself would let it escape the cleanup and
 * become the caller's problem.
 */
export function predictScores(model, featureMatrix) {
  if (featureMatrix.length === 0) return []

  return tf.tidy(() => {
    const inputs = tf.tensor2d(featureMatrix)
    const outputs = model.predict(inputs)
    return Array.from(outputs.dataSync())
  })
}

/**
 * Splits indices into k folds while preserving the class ratio in each of them.
 *
 * Stratification matters with small data: with 6 positives spread over 4 plain
 * random folds, one fold can easily end up with zero positives, and its accuracy
 * becomes pure chance. Dealing positives and negatives round-robin keeps every
 * fold representative.
 *
 * `random` is optional so the first partition can stay deterministic (reproducible
 * tests) while the repeats are shuffled (see `crossValidate`).
 */
export function stratifiedFolds(labels, foldCount, random = null) {
  const folds = Array.from({ length: foldCount }, () => [])
  const byClass = { 0: [], 1: [] }

  labels.forEach((label, index) => byClass[label].push(index))

  let cursor = 0
  for (const indices of [byClass[1], byClass[0]]) {
    const ordered = random ? shuffleIndices(indices, random) : indices

    for (const index of ordered) {
      folds[cursor % foldCount].push(index)
      cursor += 1
    }
  }

  return folds
}

function shuffleIndices(indices, random) {
  const result = [...indices]

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const temporary = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = temporary
  }

  return result
}

/**
 * REPEATED STRATIFIED K-FOLD CROSS-VALIDATION — the honest answer to "is this
 * model any good?".
 *
 * With 20 examples, holding out 5 for validation and reporting accuracy on them is
 * close to a coin toss: one example flipping moves the number by 20 points.
 * Cross-validation instead uses ALL the data for evaluation:
 *
 *     round 1:  [test][train][train][train]
 *     round 2:  [train][test][train][train]
 *     round 3:  [train][train][test][train]
 *     round 4:  [train][train][train][test]
 *
 * Every example is predicted exactly once by a model that never saw it. The k
 * models are then thrown away — the value is the estimate, not the models.
 *
 * `repeats` exists because a single fixed partition can be systematically LUCKY:
 * measured on the same dataset, one partition reported 72% where the average over
 * three partitions reported 62.5%. That is bias, not noise, and repeating the
 * split with different shuffles is what removes it. The cost is linear: 4 folds ×
 * 3 repeats = 12 models trained per evaluation.
 *
 * Note how every derived statistic is rebuilt FROM THE TRAINING FOLD ONLY. Leaking
 * anything computed over the test fold back into training is the classic way to
 * produce an impressive number that collapses in production.
 */
export async function crossValidate(
  dataset,
  { folds = 4, repeats = 3, random = Math.random, similarity = 'none', ...options } = {},
) {
  const foldCount = Math.min(folds, dataset.labels.length)
  if (foldCount < 2) return emptyEvaluation()

  const similaritySources = pickSimilaritySources(dataset, similarity)
  const confusion = { truePositives: 0, trueNegatives: 0, falsePositives: 0, falseNegatives: 0 }
  const partitions = []

  for (let repeat = 0; repeat < Math.max(1, repeats); repeat += 1) {
    partitions.push(...stratifiedFolds(dataset.labels, foldCount, repeat === 0 ? null : random))
  }

  for (const testIndices of partitions) {
    if (testIndices.length === 0) continue

    const testSet = new Set(testIndices)
    const trainIndices = dataset.labels.map((_, index) => index).filter((i) => !testSet.has(i))
    const trainLabels = trainIndices.map((i) => dataset.labels[i])

    // A fold whose training side lost an entire class cannot teach anything.
    if (new Set(trainLabels).size < 2) continue

    const foldTraining = {
      features: trainIndices.map((i) => dataset.features[i]),
      labels: trainLabels,
    }
    const foldTesting = testIndices.map((i) => dataset.features[i])

    const trainSources = similaritySources ? trainIndices.map((i) => similaritySources[i]) : null
    const testSources = similaritySources ? testIndices.map((i) => similaritySources[i]) : null

    const { model } = await trainModel(
      trainSources ? augmentTrainingSet(foldTraining, trainSources) : foldTraining,
      // No validation split inside a fold: the fold is already the held-out set.
      { ...options, minSamplesForValidation: Number.POSITIVE_INFINITY },
    )

    const scores = predictScores(
      model,
      testSources
        ? augmentCandidates(
            foldTesting,
            // Centroids built from the TRAINING fold only, never the test fold.
            buildTasteProfile(trainSources, trainLabels),
            testSources,
          )
        : foldTesting,
    )

    // 0.5 is the decision threshold that turns a probability into a yes/no answer.
    scores.forEach((score, position) => {
      const predicted = score >= 0.5 ? 1 : 0
      const actual = dataset.labels[testIndices[position]]

      if (actual === 1 && predicted === 1) confusion.truePositives += 1
      else if (actual === 1) confusion.falseNegatives += 1
      else if (predicted === 1) confusion.falsePositives += 1
      else confusion.trueNegatives += 1
    })

    model.dispose()
  }

  return summarizeEvaluation(confusion, foldCount, Math.max(1, repeats))
}

/**
 * Selects which vectors feed the optional similarity features. Both options were
 * implemented, measured and left disabled — see `taste.js` and `plotText.js`.
 */
export function pickSimilaritySources(dataset, similarity) {
  if (similarity === 'taste') return dataset.features
  if (similarity === 'plot') return dataset.plotVectors ?? null
  return null
}

function emptyEvaluation() {
  return {
    folds: 0,
    evaluated: 0,
    accuracy: null,
    balancedAccuracy: null,
    recallPositive: null,
    recallNegative: null,
    majorityBaseline: null,
    confusion: null,
  }
}

/**
 * Turns the confusion matrix into the metrics that actually mean something.
 *
 *                       predicted yes        predicted no
 *     actually yes   →  truePositives        falseNegatives
 *     actually no    →  falsePositives       trueNegatives
 *
 * Plain ACCURACY is reported but must never be read alone: on a dataset that is
 * 70% negative, answering "no" to everything scores 70%.
 *
 * BALANCED ACCURACY — the mean of the two per-class recalls — is the headline
 * number, because the majority-class guesser scores exactly 50% on it.
 *
 * RECALL PER CLASS is exported separately because the two failure modes are not
 * equally bad for a recommender. A `recallPositive` of 50% means half the movies
 * the user would have loved are never surfaced, which is invisible in the accuracy
 * figure and fatal to the product.
 *
 * MAJORITY BASELINE is included so the model's number is always read against the
 * score of the trivial strategy it has to beat.
 */
function summarizeEvaluation(confusion, foldCount, repeats = 1) {
  const { truePositives, trueNegatives, falsePositives, falseNegatives } = confusion
  const evaluated = truePositives + trueNegatives + falsePositives + falseNegatives
  if (evaluated === 0) return emptyEvaluation()

  const actualPositives = truePositives + falseNegatives
  const actualNegatives = trueNegatives + falsePositives

  const recallPositive = actualPositives > 0 ? truePositives / actualPositives : null
  const recallNegative = actualNegatives > 0 ? trueNegatives / actualNegatives : null

  return {
    folds: foldCount,
    repeats,
    evaluated,
    accuracy: (truePositives + trueNegatives) / evaluated,
    balancedAccuracy:
      recallPositive !== null && recallNegative !== null
        ? (recallPositive + recallNegative) / 2
        : null,
    recallPositive,
    recallNegative,
    majorityBaseline: Math.max(actualPositives, actualNegatives) / evaluated,
    confusion,
  }
}

// TensorFlow.js addresses storage through URL schemes. `indexeddb://` writes the
// topology and the weights so the next visit can score without retraining.
export async function saveModel(model, url = MODEL_STORAGE_URL) {
  await model.save(url)
}

// Returns null instead of throwing when nothing was ever saved, so the caller can
// simply branch on "no model yet".
export async function loadSavedModel(url = MODEL_STORAGE_URL) {
  try {
    return await tf.loadLayersModel(url)
  } catch {
    return null
  }
}

export async function deleteSavedModel(url = MODEL_STORAGE_URL) {
  try {
    await tf.io.removeModel(url)
  } catch {
    // there was nothing saved
  }
}
