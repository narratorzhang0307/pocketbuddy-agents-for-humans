import type { GiantFlower, GiantFlowerHanging } from "./GiantFlower";

export type GiantFlowerGardenSite = {
  id: string;
  name: string;
  district: string;
  districtId: string;
  position: [number, number];
  category: "canal" | "culture" | "forest" | "neighborhood" | "park" | "sports";
  hangings: GiantFlowerHanging[];
  scale?: number;
};

type DistrictGiantFlowerOptions = {
  sites: readonly GiantFlowerGardenSite[];
  templates: readonly GiantFlower[];
  cityId?: string;
};

function previewPosition(
  position: [number, number],
  sites: readonly GiantFlowerGardenSite[],
): [number, number] {
  const longitudes = sites.map((site) => site.position[0]);
  const latitudes = sites.map((site) => site.position[1]);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const horizontal = (position[0] - west) / Math.max(east - west, 0.000001);
  const vertical = (position[1] - south) / Math.max(north - south, 0.000001);
  return [8 + horizontal * 84, 90 - vertical * 80];
}

export function buildDistrictGiantFlowers({
  sites,
  templates,
  cityId,
}: DistrictGiantFlowerOptions): GiantFlower[] {
  if (templates.length === 0) {
    throw new Error("参天大花至少需要一个可复用模板");
  }

  return sites.map((site, index) => {
    const template = templates[index % templates.length];
    const isCrown = template.giantTheme === "orange-crown";
    const districtLabel = site.district.replace(/(?:新区|区|县|市)$/, "");
    return {
      ...template,
      id: `${site.districtId}-flower-${site.id}`,
      name: isCrown ? `${districtLabel}花冠` : `${districtLabel}白星`,
      position: site.position,
      preview: previewPosition(site.position, sites),
      scale: site.scale ?? template.scale * 0.82,
      poem: `${site.name}的风经过花冠，把地点的记忆交给来往的人。`,
      memory: `${site.district} · ${site.name}`,
      district: site.district,
      cityId,
      siteId: site.id,
      siteName: site.name,
      hangings: site.hangings.map((hanging) => ({ ...hanging })),
    };
  });
}
