// Story Dice engine: the three dice and the story-starter builder. Pure, no DOM, tested in engine.test.mjs.

// Each die has 12 faces. Heroes have a full intro and a short name used later in the story.
export const HEROES = [
  { e: "🐉", full: "a little dragon called Ember", short: "Ember", label: "Dragon" },
  { e: "🐶", full: "a fluffy puppy called Biscuit", short: "Biscuit", label: "Puppy" },
  { e: "🤖", full: "a tiny robot called Bolt", short: "Bolt", label: "Robot" },
  { e: "🧚", full: "a fairy called Twinkle", short: "Twinkle", label: "Fairy" },
  { e: "🦖", full: "a dinosaur called Rex", short: "Rex", label: "Dinosaur" },
  { e: "🐰", full: "a bunny called Hop", short: "Hop", label: "Bunny" },
  { e: "👩‍🚀", full: "an astronaut called Stella", short: "Stella", label: "Astronaut" },
  { e: "🦁", full: "a lion cub called Leo", short: "Leo", label: "Lion cub" },
  { e: "🐢", full: "a slow, wise turtle called Shelly", short: "Shelly", label: "Turtle" },
  { e: "🧙", full: "a young wizard called Pip", short: "Pip", label: "Wizard" },
  { e: "🐙", full: "an octopus called Inky", short: "Inky", label: "Octopus" },
  { e: "🦄", full: "a unicorn called Sparkle", short: "Sparkle", label: "Unicorn" },
];

export const PLACES = [
  { e: "🏰", where: "in a big stone castle", label: "Castle" },
  { e: "🌲", where: "deep in a whispering forest", label: "Forest" },
  { e: "🏝️", where: "on a tiny island in the sea", label: "Island" },
  { e: "🌙", where: "on the Moon", label: "Moon" },
  { e: "🌊", where: "at the bottom of the ocean", label: "Ocean" },
  { e: "🏔️", where: "at the top of a snowy mountain", label: "Mountain" },
  { e: "🍭", where: "in a town made of candy", label: "Candy town" },
  { e: "🚂", where: "on a train that never stopped", label: "Train" },
  { e: "🌋", where: "next to a sleepy volcano", label: "Volcano" },
  { e: "🎪", where: "in a circus tent", label: "Circus" },
  { e: "🏡", where: "in a cosy little house", label: "House" },
  { e: "🌵", where: "in a hot, sandy desert", label: "Desert" },
];

// `what` follows the hero's short name. `ask` are "what happens next?" questions; {h} is the hero.
export const PROBLEMS = [
  { e: "🎩", what: "lost a favourite hat", label: "Lost hat",
    ask: ["Where could the hat be hiding?", "Who saw the hat last?"] },
  { e: "🌧️", what: "woke up to a storm that wouldn't stop", label: "Storm",
    ask: ["Where can {h} stay dry?", "What makes the rain go away?"] },
  { e: "🥚", what: "found a strange egg that started to crack", label: "Mystery egg",
    ask: ["What hatches out of the egg?", "Where is its mummy or daddy?"] },
  { e: "🗝️", what: "found a key, but nobody knew which door it opened", label: "Strange key",
    ask: ["Which door do you think it opens?", "What is behind the door?"] },
  { e: "😴", what: "couldn't fall asleep, no matter what", label: "Can't sleep",
    ask: ["What keeps {h} awake?", "What helps {h} feel sleepy?"] },
  { e: "🎂", what: "had a party tomorrow, but the cake was gone", label: "Missing cake",
    ask: ["Who took the cake?", "How can {h} make a new one?"] },
  { e: "🫧", what: "sneezed, and everything started floating", label: "Floaty sneeze",
    ask: ["What floats away first?", "How does {h} get back down?"] },
  { e: "🗺️", what: "found a treasure map with a big red X", label: "Treasure map",
    ask: ["Who comes along on the adventure?", "What is the treasure?"] },
  { e: "🐾", what: "heard a tiny voice calling for help", label: "Cry for help",
    ask: ["Who is calling?", "How does {h} help them?"] },
  { e: "🌈", what: "saw that all the colours had disappeared", label: "No colours",
    ask: ["Where did the colours go?", "Which colour comes back first?"] },
  { e: "🎈", what: "was carried up into the sky by a balloon", label: "Balloon ride",
    ask: ["What can {h} see from up high?", "How does {h} land?"] },
  { e: "👣", what: "kept finding giant footprints everywhere", label: "Big footprints",
    ask: ["Who made the footprints?", "Are they friendly?"] },
];

export const DICE = [
  { key: "hero", name: "Hero", faces: HEROES },
  { key: "place", name: "Place", faces: PLACES },
  { key: "problem", name: "Problem", faces: PROBLEMS },
];

const MORNINGS = ["One morning", "One sunny day", "One night", "One windy afternoon", "Then one day"];
const HELPERS = ["Who could help {h}?", "What does {h} say?", "How does {h} feel?"];

// rand() returns [0, 1). Picks a face index for each die; locked dice keep their current index.
export function roll(current, locked = [false, false, false], rand = Math.random) {
  return DICE.map((d, i) => (locked[i] && current?.[i] != null ? current[i] : Math.floor(rand() * d.faces.length)));
}

// Builds the story starter from three face indexes. `seed` (0..1) picks the opening phrase so a
// re-roll of the same faces can sound a little different.
export function buildStory([hi, pi, xi], seed = 0) {
  const hero = HEROES[hi], place = PLACES[pi], problem = PROBLEMS[xi];
  if (!hero || !place || !problem) throw new Error("bad face index");
  const when = MORNINGS[Math.floor(seed * MORNINGS.length) % MORNINGS.length];
  const fill = (s) => s.replaceAll("{h}", hero.short);
  const opening = `Once upon a time, there was ${hero.full}, who lived ${place.where}.`;
  const twist = `${when}, ${hero.short} ${problem.what}!`;
  const helper = HELPERS[Math.floor(seed * 97) % HELPERS.length];
  const questions = [...problem.ask, helper].map(fill);
  return {
    hero, place, problem,
    opening, twist, questions,
    ending: "How does the story end?",
    // What the phone reads aloud: the starter, then a pause, then the first question.
    speech: `${opening} ${twist} ... What happens next? ${questions[0]}`,
  };
}

// Mixed-case title for the "story card", e.g. "Ember and the Lost hat".
export function storyTitle([hi, , xi]) {
  return `${HEROES[hi].short} and the ${PROBLEMS[xi].label}`;
}
