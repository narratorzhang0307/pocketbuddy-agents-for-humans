# Frost Health Taskmaster

入口在 `index.ts`，PWA 单例装配在 `src/app/lib/frostHealthTaskmaster.ts`。

```ts
const runtime = getFrostHealthRuntime({
  observeMeal: qwenSamFoodProvider,
  guideMotion: herMotionProvider,
  observeNature: natureProvider,
});

const task = await runtime.taskmaster.start({
  task_id: crypto.randomUUID(),
  user_id: userId,
  kind: 'daily_review',
  requested_at: new Date().toISOString(),
  input: { day: '2026-08-19' },
  source: 'user',
});
```

需要用户确认时返回 `waiting_confirmation`，UI 展示 `actions[next_action_index]` 后调用 `confirm(taskId, actionId)`。需要设备或模型结果时返回 `waiting_external`；结果进入适配器或事件队列后调用 `resume(taskId)`。

完整设计和真实/未接通边界见 [ARCHITECTURE.md](./ARCHITECTURE.md)。
