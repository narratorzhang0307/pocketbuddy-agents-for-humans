export type MapScreenRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function overlaps(first: MapScreenRect, second: MapScreenRect) {
  return (
    first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top
  );
}

export function horizontalMapBuddyAvoidanceOffset(
  buddy: MapScreenRect,
  obstacles: readonly MapScreenRect[],
  viewportWidth: number,
  gap = 8,
) {
  const verticalObstacles = obstacles.filter(
    (obstacle) => buddy.top < obstacle.bottom && buddy.bottom > obstacle.top,
  );
  if (verticalObstacles.every((obstacle) => !overlaps(buddy, obstacle))) return 0;

  const edgePadding = 4;
  const overflow = (offset: number) =>
    Math.max(0, edgePadding - (buddy.left + offset))
    + Math.max(0, buddy.right + offset - (viewportWidth - edgePadding));
  const shifted = (offset: number): MapScreenRect => ({
    left: buddy.left + offset,
    top: buddy.top,
    right: buddy.right + offset,
    bottom: buddy.bottom,
  });
  const candidates = verticalObstacles.flatMap((obstacle) => [
    obstacle.left - gap - buddy.right,
    obstacle.right + gap - buddy.left,
  ]);
  return candidates
    .filter((offset) =>
      verticalObstacles.every(
        (obstacle) => !overlaps(shifted(offset), obstacle),
      ),
    )
    .sort((first, second) =>
      overflow(first) - overflow(second)
      || Math.abs(first) - Math.abs(second),
    )[0] ?? 0;
}
