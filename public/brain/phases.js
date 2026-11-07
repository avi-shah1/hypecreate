/* The five phases a video passes through in the brain: content for the brain walkthrough.
 * gruppen = keys from regions.json that light up during the phase. */
window.PPPhasen = [
  {
    key: "ankommen", nr: 1, name: "Arrive", zeit: "0-150 ms", moment: 0.1,
    gruppen: ["sehen", "bewegung", "hoeren"], blick: "links",
    kurz: "Image and sound arrive: contrast, color, motion, loudness.",
    erklaerung: "What the eye passes on are signals for contrast, color and motion. A salience map pulls the gaze to the strongest deviation, whether or not you recognize anything yet. For sound, the brain flags jumps and breaks after 100 to 250 ms, without any attention at all.",
    hebel: ["Color or contrast shock in the first frame", "Movement toward the camera", "Volume jump or a familiar sound intro"],
    studien: [
      { wer: "Itti & Koch 2001", was: "The gaze jumps to the strongest deviation in color, brightness, orientation and motion: a salience map that works before anything is recognized.", url: "https://doi.org/10.1038/35058500" },
      { wer: "Thorpe, Fize & Marlot 1996", was: "The brain can tell whether an animal is in a picture after about 150 milliseconds.", url: "https://doi.org/10.1038/381520a0" },
      { wer: "Näätänen et al. 2007", was: "The auditory cortex flags deviant tones automatically after 100 to 250 milliseconds, even without attention.", url: "https://doi.org/10.1016/j.clinph.2007.04.026" },
    ],
    bereiche: "Visual cortex V1-V4 (occipital lobe) · Motion area MT/V5 · Auditory cortex (Heschl's gyrus, superior temporal lobe)",
    gestaltbar: true,
  },
  {
    key: "erkennen", nr: 2, name: "Recognize", zeit: "~170 ms", moment: 0.2,
    gruppen: ["gesichter", "orte", "menschen", "koerper"], blick: "unten",
    kurz: "Faces, bodies, objects and places are recognized.",
    erklaerung: "The brain matches the signal against what it has stored and keeps predicting what comes next. It recognizes faces especially fast. Familiar input takes less effort and feels right. Anything unexpected creates a prediction error, and that pulls attention.",
    hebel: ["A face close to the camera (no influencer needed)", "Scale break: a familiar object at the wrong size", "A place the audience recognizes instantly"],
    studien: [
      { wer: "Kanwisher, McDermott & Chun 1997", was: "A dedicated area on the underside of the temporal lobe responds preferentially to faces.", url: "https://doi.org/10.1523/JNEUROSCI.17-11-04302.1997" },
      { wer: "Epstein & Kanwisher 1998", was: "An area on the inner side of the temporal lobe responds to places and spaces.", url: "https://doi.org/10.1038/33402" },
      { wer: "Grill-Spector, Henson & Martin 2006", was: "Familiar input triggers a weaker, faster response: the brain saves effort on what it already knows.", url: "https://doi.org/10.1016/j.tics.2005.11.006" },
      { wer: "Friston 2010", was: "The brain predicts constantly; whatever does not fit creates a prediction error and pulls attention.", url: "https://doi.org/10.1038/nrn2787" },
    ],
    bereiche: "Face area FFA and object area LOC (underside of the temporal lobe) · Place area PPA (inner side) · STS (people, voices) · Body and action areas",
    gestaltbar: true,
  },
  {
    key: "verstehen", nr: 3, name: "Understand", zeit: "~400 ms", moment: 0.5,
    gruppen: ["sprache", "menschen"], blick: "links",
    kurz: "Words and on-screen text take on meaning.",
    erklaerung: "The language network builds meaning, spoken or written. The clearer the text, the faster it lands. A familiar trend phrase is understood instantly; a twist on it grabs attention, but wordplay only where the brand allows it. Otherwise the twist comes from the image or the situation.",
    hebel: ["Short, unambiguous on-screen text", "Direct address", "A familiar trend phrase or sound, with the twist in the image, the situation or (where allowed) the wording"],
    studien: [
      { wer: "Potter et al. 2014", was: "The meaning of an image is grasped even when it is shown for only 13 milliseconds.", url: "https://doi.org/10.3758/s13414-013-0605-z" },
      { wer: "Kutas & Hillyard 1980", was: "About 400 milliseconds in, the brain reacts measurably when a word does not fit the sentence.", url: "https://doi.org/10.1126/science.7350657" },
      { wer: "Huth et al. 2016", was: "The meaning of language is spread across large parts of the cortex, well beyond a single language center.", url: "https://doi.org/10.1038/nature17637" },
    ],
    bereiche: "Left-hemisphere language network: Broca's area (inferior frontal lobe), middle temporal lobe, angular gyrus · STS",
    gestaltbar: true,
  },
  {
    key: "bewerten", nr: 4, name: "Evaluate", zeit: "1-3 s", moment: 1.5,
    gruppen: ["salienz", "bewertung", "selbst", "ueberraschung", "aufmerksamkeit"], blick: "innen-links",
    kurz: "Does it matter? Do I want to watch? Is it for me? This is where the swipe happens.",
    erklaerung: "The reward system and the insula decide. In the YouTube study, more reward and less discomfort in the first 4 seconds meant more views. No video feature measures this phase directly.",
    hebel: ["The promise right away: “I want to see this”", "Break expectations, but avoid disgust or embarrassment", "Personal relevance: POV, relatable"],
    studien: [
      { wer: "Tong et al. 2020", was: "More reward (nucleus accumbens) and less discomfort (anterior insula) in the first 4 seconds = more YouTube views; the brain model explained 28%.", url: "https://doi.org/10.1073/pnas.1905178117" },
      { wer: "Genevsky, Yoon & Knutson 2017", was: "Accumbens activity predicted which crowdfunding projects got funded online; the survey did not.", url: "https://doi.org/10.1523/JNEUROSCI.1633-16.2017" },
      { wer: "Scholz et al. 2025", was: "Averaged over 16 studies, brain signals explain only 1.17% of market success: real, but small.", url: "https://doi.org/10.1093/pnasnexus/pgaf287" },
    ],
    bereiche: "Salience network (anterior insula, anterior cingulate gyrus) · Valuation (orbitofrontal, ventromedial frontal lobe) · Default mode network · deep: nucleus accumbens, amygdala",
    gestaltbar: false,
  },
  {
    key: "behalten", nr: 5, name: "Remember", zeit: "afterwards", moment: null,
    gruppen: ["orte", "selbst"], blick: "innen-links",
    kurz: "Memories are stored at event boundaries: cuts, turns.",
    erklaerung: "The hippocampus sits on the inner side of the temporal lobe, right next to the highlighted area. It stores memories at the boundaries between events. Something new in a familiar frame sticks especially well. Brand and product belong right after the twist or cut.",
    hebel: ["Brand right after the first cut", "Product at the twist, kept out of the intro", "Recurring format: familiar frame, new content"],
    studien: [
      { wer: "Baldassano et al. 2017", was: "The brain splits films into events; the hippocampus stores memories at the boundaries between them.", url: "https://doi.org/10.1016/j.neuron.2017.06.041" },
      { wer: "Lisman & Grace 2005", was: "Novelty releases dopamine through the hippocampus-VTA loop and is therefore stored better.", url: "https://doi.org/10.1016/j.neuron.2005.05.002" },
    ],
    bereiche: "Hippocampus (deep, inner side of the temporal lobe) · Parahippocampal cortex · Default mode network",
    gestaltbar: true,
  },
];
