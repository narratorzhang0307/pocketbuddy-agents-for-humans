import { useEffect, useState } from 'react';
import type { CityMapRuntime } from '../lib/maps/runtime';
import { POCKET_PLANT_ASSETS } from '../lib/pocket-plants/catalog';
import {
  readPocketPlantings,
  subscribePocketPlantings,
} from '../lib/pocket-plants/planting';
import {
  readHungNatureSoundCards,
  readNatureSoundRecognition,
  subscribeHungNatureSoundCards,
} from '../lib/nature-sound/store';
import {
  catalogPreviewDetection,
  NATURE_SOUND_SPECIES,
  speciesFrameUrl,
} from '../lib/nature-sound/speciesCatalog';
import { WEST_LAKE_PLANT_CARD_MODULES } from '../lib/nature-sound/plantCardModules';
import type { HungNatureSoundCard, NatureSoundObservation } from '../lib/nature-sound/types';
import './NatureSoundSudiPlantLayer.css';

const markerScaleForZoom = (zoom: number) =>
  Math.min(1.18, Math.max(0.68, 0.78 + (zoom - 15) * 0.12));

type NatureSoundSudiPlantLayerProps = {
  map: CityMapRuntime | null;
  onOpenNatureCard?: (speciesId: string) => void;
  focusObservation?: NatureSoundObservation | null;
};

export default function NatureSoundSudiPlantLayer({
  map,
  onOpenNatureCard,
  focusObservation,
}: NatureSoundSudiPlantLayerProps) {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const unsubscribeCards = subscribeHungNatureSoundCards(refresh);
    const unsubscribePlants = subscribePocketPlantings(refresh);
    return () => {
      unsubscribeCards();
      unsubscribePlants();
    };
  }, []);

  useEffect(() => {
    if (!map) return;
    const realPlants = readPocketPlantings().slice(0, WEST_LAKE_PLANT_CARD_MODULES.length);
    const modules = WEST_LAKE_PLANT_CARD_MODULES.map((module, index) => {
      const planting = realPlants[index];
      return planting ? {
        ...module,
        id: planting.id,
        plantAssetId: planting.assetId,
        place: planting.place || module.place,
      } : module;
    });
    const hungCards = readHungNatureSoundCards();
    const recognition = readNatureSoundRecognition();
    const recordedDetections = recognition?.detections ?? [];
    const recordedBySpecies = new Map(
      recordedDetections.map((detection) => [detection.speciesId, detection]),
    );
    const recognizedSpeciesIds = new Set([
      ...recordedDetections.map((detection) => detection.speciesId),
      ...hungCards.map((card) => card.detection.speciesId),
    ]);
    const fallbackRecordedAt = recognition?.recordedAt ?? new Date().toISOString();

    const entries = modules.flatMap((module, index) => {
      const asset = POCKET_PLANT_ASSETS.find((candidate) => candidate.id === module.plantAssetId);
      if (!asset) return [];
      const configuredCards = module.cardSpeciesIds.flatMap((speciesId): HungNatureSoundCard[] => {
        const profile = NATURE_SOUND_SPECIES.find((candidate) => candidate.speciesId === speciesId);
        if (!profile) return [];
        const detection = recordedBySpecies.get(speciesId) ?? catalogPreviewDetection(profile);
        return [{
          detection,
          plantingId: module.id,
          hungAt: detection.recordedAt ?? fallbackRecordedAt,
          locationLabel: detection.locationLabel ?? `西湖 · ${module.place}`,
        }];
      });
      const seenSpecies = new Set<string>();
      const attachedCards = [
        ...hungCards.filter((card) => card.plantingId === module.id),
        ...configuredCards,
      ].filter((card) => {
        if (seenSpecies.has(card.detection.speciesId)) return false;
        seenSpecies.add(card.detection.speciesId);
        return true;
      }).slice(0, 3);
      const host = document.createElement('div');
      host.className = `ns-sudi-plant-marker${attachedCards.length ? ' has-cards' : ''}`;
      host.dataset.plantingId = module.id;
      host.dataset.ignoreMapDestination = 'true';
      host.style.width = `${module.plantSize}px`;
      host.style.height = `${Math.round(module.plantSize * 1.42)}px`;
      host.style.setProperty('--plant-lean', `${index % 2 === 0 ? -2.2 : 2.2}deg`);
      host.style.setProperty('--plant-side', `${index % 2 === 0 ? -6 : 6}px`);
      host.style.setProperty('--plant-delay', `${-index * 0.62}s`);
      const [stemX, stemY] = module.stemAnchor;
      host.style.setProperty('--stem-x', `${stemX}%`);
      host.style.setProperty('--stem-y', `${stemY}%`);
      host.title = `${asset.name} · 西湖 · ${module.place}${attachedCards.length ? ` · ${attachedCards.length} 张声音卡` : ''}`;
      host.setAttribute('role', 'group');
      host.setAttribute('aria-label', host.title);

      const image = document.createElement('img');
      image.className = 'ns-sudi-plant-art';
      image.src = asset.src;
      image.alt = '';
      image.decoding = 'async';
      image.draggable = false;

      const label = document.createElement('span');
      label.className = 'ns-sudi-plant-label';
      const name = document.createElement('b');
      name.textContent = asset.name;
      const place = document.createElement('small');
      place.textContent = module.place;
      label.append(name, place);
      host.append(image, label);

      if (attachedCards.length) {
        const hanging = document.createElement('span');
        hanging.className = 'ns-sudi-hanging-cards';
        attachedCards.forEach((card, cardIndex) => {
          const cardFace = document.createElement('button');
          cardFace.type = 'button';
          cardFace.className = 'ns-sudi-hanging-card';
          cardFace.style.setProperty('--card-index', String(cardIndex));
          cardFace.dataset.speciesId = card.detection.speciesId;
          cardFace.dataset.ignoreMapDestination = 'true';
          cardFace.title = `打开${card.detection.commonName}的图鉴卡`;
          cardFace.setAttribute('aria-label', cardFace.title);

          const profile = NATURE_SOUND_SPECIES.find(
            (candidate) => candidate.speciesId === card.detection.speciesId,
          );
          const art = document.createElement('span');
          art.className = 'ns-sudi-hanging-card__art';
          const bird = document.createElement('img');
          bird.alt = '';
          bird.decoding = 'async';
          bird.draggable = false;
          bird.src = profile
            ? speciesFrameUrl(profile.assetSlug, profile.assetSlug === 'grey-nightjar' ? 'call' : 'listen')
            : card.detection.imageUrl ?? '';
          art.append(bird);

          const name = document.createElement('span');
          name.className = 'ns-sudi-hanging-card__name';
          name.textContent = card.detection.commonName;
          const status = document.createElement('span');
          status.className = 'ns-sudi-hanging-card__status';
          status.dataset.recognized = String(recognizedSpeciesIds.has(card.detection.speciesId));
          status.setAttribute('aria-hidden', 'true');
          cardFace.append(art, name, status);

          const openCard = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenNatureCard?.(card.detection.speciesId);
          };
          cardFace.addEventListener('pointerdown', (event) => event.stopPropagation());
          cardFace.addEventListener('pointerup', openCard);
          cardFace.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') openCard(event);
          });
          hanging.append(cardFace);
        });
        host.append(hanging);
      }

      host.addEventListener('pointerdown', (event) => event.stopPropagation());
      host.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        host.dataset.open = host.dataset.open === 'true' ? 'false' : 'true';
      });

      return [{
        host,
        plant: module,
        attachedCards,
        routePosition: module.position,
        marker: map.createMarker({
          element: host,
          position: module.position,
          anchor: 'bottom-center',
          zIndex: attachedCards.length ? 191 : 178,
          zooms: [13.55, 20],
        }),
      }];
    });

    const syncScale = () => {
      const scale = markerScaleForZoom(map.getZoom()).toFixed(3);
      entries.forEach(({ host }) => host.style.setProperty('--map-scale', scale));
    };
    map.on('move', syncScale);
    syncScale();

    if (focusObservation && entries.length) {
      const stationKey = (value: string) => value
        .replace(/西湖|苏堤/g, '')
        .replace(/听鸟站/g, '')
        .replace(/[·\s]/g, '');
      const targetPlace = stationKey(focusObservation.locationLabel);
      const focusedEntry = entries.find(({ plant }) => (
        Boolean(focusObservation.plantingId)
        && plant.id === focusObservation.plantingId
      )) ?? entries.find(({ plant }) => {
        const plantPlace = stationKey(plant.place);
        return Boolean(targetPlace && plantPlace)
          && (targetPlace.includes(plantPlace) || plantPlace.includes(targetPlace));
      }) ?? entries.find(({ attachedCards }) => (
        attachedCards.some((card) => card.detection.speciesId === focusObservation.speciesId)
      )) ?? entries[
        [...focusObservation.speciesId].reduce((total, character) => total + character.charCodeAt(0), 0)
        % entries.length
      ];

      focusedEntry.host.classList.add('is-focused');
      focusedEntry.host.dataset.open = 'true';
      map.flyTo({
        center: focusedEntry.routePosition,
        zoom: Math.max(map.getZoom(), 17),
        duration: 520,
      });
    }

    return () => {
      map.off('move', syncScale);
      entries.forEach(({ marker }) => marker.remove());
    };
  }, [focusObservation, map, onOpenNatureCard, revision]);

  return null;
}
