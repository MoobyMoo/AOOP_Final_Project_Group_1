# Candidate listening and selection

1. Open the offline listening index in a browser and choose a candidate by its category and intended use. Keep the listening volume fixed while comparing related cues. [Open the listening index](index.html)
2. Check the source notes for the synthesis recipe, target peak, and any noise seed or post-processing. The current WAV hash in the catalog identifies the file being auditioned. A hash recorded before trimming identifies the source version. [Open the format and provenance catalog](catalog.json)
3. Audition the beginning, body and ending of the cue. Check that its timing, texture and loudness suit the intended action. For repeated actions, play the cue several times at the expected cadence.
4. Review the stored-sample measurements alongside the listening result. [Open the measured quality report](quality-report.json)
5. Record the candidate ID, current SHA-256, intended use, listening level and selection notes with the eventual audio integration change.

## Reading the measurements

| Field | Interpretation |
| --- | --- |
| `samplePeakDbfs` | Largest absolute stored PCM sample relative to full scale. |
| `rmsDbfs` | Average energy across the complete file, including its padding. |
| `crestDb` | Sample peak minus whole-file RMS in decibels. |
| `leadingSilenceMs` and `trailingSilenceMs` | Time outside the first and last samples exceeding the report's -60 dBFS threshold. Quiet decay can contribute to these values. |
| `leadingZeroSamples` and `trailingZeroSamples` | Exact counts of consecutive zero-valued PCM samples at the file boundaries. |
| `leadingZeroMs` and `trailingZeroMs` | The exact-zero counts converted to milliseconds at the file's sample rate. |
| `clippedSamples` | Count of stored PCM samples whose absolute value reaches 32767. |

Whole-file RMS rises when zero padding is shortened, because the same signal energy is averaged over fewer samples. Use the listening comparison and intended role when selecting a mix level.

For trimmed candidates, the source notes document the original duration and hash, the number of removed zero samples, and the retained padding. Those edits use a 12 ms minimum padding and a 10 ms duration grid. Their retained PCM samples are checked against the source bit for bit.

A passed PCM check establishes the measured file properties. Listening supplies the timing, texture and loudness decision for the intended action.
