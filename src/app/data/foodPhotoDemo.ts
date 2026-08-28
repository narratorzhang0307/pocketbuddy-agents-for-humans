// Presentation examples only. These are NOT MealCandidates or health events.
// Nutrition labels and rectangles illustrate the UI, not a live model result.
export const FOOD_PHOTO_DEMOS = [
  { id: 'cobb', kind: 'ui-demo-only', title: '香草鸡肉考伯碗', image: '/assets/food-demo/food-sense-cobb-bowl.jpg', time: '午餐 · 12:36', energy: '480–590', regions: 3 },
  { id: 'omelette', kind: 'ui-demo-only', title: '菠菜芝士欧姆蛋与莓果', image: '/assets/food-demo/food-sense-omelette-fruit.jpg', time: '早餐 · 08:12', energy: '390–470', regions: 2 },
  { id: 'salad', kind: 'ui-demo-only', title: '草莓蓝纹芝士沙拉', image: '/assets/food-demo/food-sense-strawberry-salad.jpg', time: '加餐 · 示例昨日 16:20', energy: '320–410', regions: 3 },
  { id: 'salmon', kind: 'ui-demo-only', title: '煎三文鱼芦笋餐盘', image: '/assets/food-demo/food-sense-salmon-asparagus.jpg', time: '晚餐 · 示例周一 18:46', energy: '510–620', regions: 3 },
] as const;

export const FOOD_DEMO_REGIONS = [
  { name: '香草鸡胸', detail: '烤制 · 去皮', portion: '120–150g', energy: '190–250 kcal', color: '#7cff6b', box: [41, 34, 27, 39] },
  { name: '鸡蛋与混合生菜', detail: '水煮 · 生食', portion: '180–235g', energy: '130–175 kcal', color: '#ffe46b', box: [24, 16, 57, 67] },
  { name: '橄榄与奶酪', detail: '沙拉配料', portion: '55–80g', energy: '160–215 kcal', color: '#ed77cb', box: [54, 27, 25, 44] },
] as const;
