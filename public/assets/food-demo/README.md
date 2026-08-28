# Food demo image attribution

The source images in this directory come from the official Google Research
Nutrition5k repository and are used as UI demonstration material.

- Source: https://github.com/google-research-datasets/Nutrition5k/tree/main/res
- Dataset: Nutrition5k: Towards Automatic Nutritional Understanding of Generic Food
- License: CC BY 4.0
- Retrieved: 2026-08-19

`meal-*.jpg` files are display crops/rotations derived from the corresponding
`nutrition5k-plate-*.jpg` source images. No derived demo value should be treated
as a live model prediction.

The `food-sense-*.jpg` meal-memory samples come from the FoodSense dataset:

- Source: https://huggingface.co/datasets/sababishraq/foodsense-dataset
- Upstream source: Yelp Open Dataset
- License: CC BY 4.0
- Retrieved: 2026-08-19
- Dataset citation: Ishraq et al., "FoodSense: A Multisensory Food Dataset and
  Benchmark for Predicting Taste, Smell, Texture, and Sound from Images," 2026.

Selected source files:

- `food-sense-cobb-bowl.jpg` ← `0123_2MdMoboaWT9XJcEZ-R-tPg.jpg`
- `food-sense-omelette-fruit.jpg` ← `0499_97yozC9i8nC3i7gW1QLBYA.jpg`
- `food-sense-strawberry-salad.jpg` ← `0095_1vzMpOt7XX987d340BuDwg.jpg`
- `food-sense-salmon-asparagus.jpg` ← `0336_6l1eOHXA8PPVoWIqv-ICKA.jpg`

The nutrition ranges and detection overlays are UI demonstration data, not
predictions or annotations supplied by FoodSense.
