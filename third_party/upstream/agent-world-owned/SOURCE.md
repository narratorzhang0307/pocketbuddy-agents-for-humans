# Agent World source snapshot

This directory is a compact, read-only snapshot of source code and data owned by the Pocket Earth author. It is retained for provenance and comparison while adapting the Agent World experience into the Alibaba competition build.

## Sources

- `ForkWorld-mobile/src/`
  - Original: `/Users/zhangcheng/Desktop/agent 世界/ForkWorld-mobile/src/`
  - Reused concepts: world themes, resident cards and the local world-definition flow.
- `ForkWorld-map/data/`
  - Original: `/Users/zhangcheng/Desktop/agent 世界/ForkWorld_世界地图/data/`
  - Reused concepts: six example worlds, owners, climate, temperament, landmarks and residents.
- `Pocket-Earth-Worlds/`
  - Original: `/Volumes/Extreme SSD/Pocket-Earth-Injective/src/app/agent-world/`
  - Reused concepts: world home, resident carousel, world entry and plaza navigation.

## Competition adaptation boundary

The Alibaba build intentionally excludes Injective, wallets, tokens, balances, contracts, chain receipts and monetisation. The adapted product model is:

`global Agent discovery -> inspect Skill manifest -> verify permissions/base/assets -> install into the device's private Skill library -> Frost routes the equipped Skill -> user confirms any write to Pocket Earth`.

The bundled world catalogue is labelled `全球示例网络`. It is demo data, not a claim of a live multi-user service.

## Visual adaptation

The original isometric buildings are deliberately not used in the competition Plaza. They made the building feel more important than the publisher. The adapted cards reuse the author's existing `上街去` animal-publisher cutouts already copied into Pocket Earth, enlarge the Agent as the primary visual, and distinguish worlds with paper tone, typography, location and memory rather than repeated architecture.

The local Builder persists only a world tone ID, NPC/animal publisher ID and Skill ID. It does not write to any remote service or alter the source projects listed above.
