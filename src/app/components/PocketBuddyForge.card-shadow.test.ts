import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Agents 卡册阴影", () => {
  const css = readFileSync(
    new URL("./PocketBuddyForge.css", import.meta.url),
    "utf8",
  );
  const source = readFileSync(
    new URL("./PocketBuddyForge.tsx", import.meta.url),
    "utf8",
  );
  const catalogSource = readFileSync(
    new URL("../lib/pocket-buddy/agentWorldCatalog.ts", import.meta.url),
    "utf8",
  );

  it("卡册总框与其中每张角色卡都不添加外投影", () => {
    expect(css).toMatch(
      /\.pbf-card-prototypes\s*\{[\s\S]*?box-shadow:\s*none;/,
    );
    expect(css).toContain(".pbf-card-prototypes .ccc-face { box-shadow: none; }");
  });

  it("四个 Agent 通过顶部入口切换，卡册仍一次只展示一张卡", () => {
    expect(source).toContain("requiredAgentWorldBlueprint('pet-caramel-dachshund')");
    expect(source).toContain('/assets/pocket-buddy/packages/holiday-christmas-dachshund/portrait-frost-no-hat-v2.png');
    expect(source).toContain("requiredAgentWorldBlueprint('puff')");
    expect(source).toContain("requiredAgentWorldBlueprint('pip')");
    expect(source).toContain("requiredAgentWorldBlueprint('mossback')");
    expect(source).toContain('className="pbf-buddy-strip is-agent-deck"');
    expect(source).not.toContain('TOTAL_CITY_CARD_COUNT');
    expect(source).not.toContain('AGENT WORLD · POCKET INDEX');
    expect(source).not.toContain('<h2>口袋伙伴卡册</h2>');
    expect(source).not.toContain('MY AGENT 卡册展示 Agent World 普通款焦糖。');
    expect(source).toContain('className="pbf-card-grid is-single"');
    expect(source).not.toContain('pbf-card-pagination');
    expect(source).not.toContain('切换为双列卡牌');
    expect(source).toContain("grid.style.setProperty('--pbf-card-scale', String(grid.clientWidth / 330))");
    expect(catalogSource).toContain('/assets/pocket-buddy/agent-world-original-v2/dotti-dachshund-card-v2.png');
    expect(css).toMatch(/\.pbf-card-grid > \.ccc-shell\s*\{[\s\S]*?width:\s*330px;[\s\S]*?zoom:\s*var\(--pbf-card-scale/);
  });
});
