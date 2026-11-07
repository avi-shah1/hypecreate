# Brain view

A holographic brain next to a phone frame. Drop in a short vertical video (or press "Analyze the sample ad" on `/brain`) and it plays through the five phases a video takes in a viewer's head: Arrive, Recognize, Understand, Evaluate, Remember. Each phase lights up the brain areas involved, with the studies behind it.

Two modes:

- **Steps:** one phase every 6 seconds, with explanation, studies and levers.
- **Timeline:** click any moment to freeze it and see the whole cascade for that second.

Plus a hook check for the first 3 seconds (first-frame contrast, motion or cut, loudness jump, first event boundary).

## What is measured, and what is not

- Image and sound features are measured in the browser: contrast, colorfulness, motion, cuts, loudness, loudness jumps, faces where the browser supports it. The video never leaves the device.
- Where the brain areas sit comes from measured group maps (see below), not from a textbook drawing. A toggle switches to the textbook atlas to compare.
- The optional layers come from our own encoding model, trained on the Emo-FilM fMRI dataset: synchrony between viewers, where the model predicts well, and emotion maps.
- It is an explainer view. It is not a brain scan of this video and it does not predict views.

## Files

| File | What |
|---|---|
| `brain.js` | WebGL brain viewer, no dependencies (holographic shader, folded and inflated surface, picking) |
| `analysis.js` | In-browser video measurement (frames at 4 Hz, Web Audio loudness, cut detection) |
| `phases.js` | The five phases: timing, regions, explanation, studies, levers |
| `walkthrough.js` | The UI: phone frame, brain, phase steps, timeline, hook check, layers |
| `fsaverage5.bin`, `regions.json` | fsaverage5 cortical mesh (20,484 vertices) with 13 function groups |
| `maps.bin`, `maps.json` | Measured map per function group, uint8 per vertex |
| `layers.bin`, `layers.json` | Layers from the Emo-FilM model, uint8 per vertex |

## Sources and licenses

- Mesh: FreeSurfer fsaverage5 via nilearn, Destrieux atlas for the textbook groups.
- Measured maps: Individual Brain Charting (Pinho et al. 2018, Sci Data; CC0 via NeuroVault), LanA language atlas (Lipkin et al. 2022, Sci Data; CC BY 4.0), NeuroQuery meta-analyses (Dockès et al. 2020, eLife; BSD-3-Clause). Full citations in `maps.json`.
- Layers: Emo-FilM fMRI and emotion annotations (Morgenroth et al. 2025, Sci Data, doi 10.1038/s41597-025-04803-5; CC0). Only group-level results are included, no individual data.
- Studies cited per phase are linked by DOI in `phases.js`.
