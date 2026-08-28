import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Play, Pause, ChevronDown, Music2, Maximize2, MapPin, Link2, Loader2, LocateFixed } from 'lucide-react';
import { ensureMusicCatalog, groupSongs, songs, songTotal, subscribeMusicCatalog, GROUP_LABELS, type GroupKey, type Song } from '../data/musicCatalog';
import { RADIO_CITIES, resolveTracksByIds, type ResolvedTrack } from '../../../frost-agent/data/radio';
import { getUserMarksByKind, subscribeUserMarks } from '../data/userMarks';
import { recordSignals } from '../../../frost-agent/harness/profile';
import { recordPlay } from '../lib/music/plays';
import { RadioStage } from './radio/RadioStage';
import DataPackManager from './DataPackManager';
import YouTubePlaybackFrame from './music/YouTubePlaybackFrame';
import { canPlayMusicSource, directAudioUrl, musicSourceLabel, youtubeVideoId } from '../lib/music/playback';
import { publishYoutubeMusicUrl, type PublishedMusicCard } from '../lib/music/youtubePublish';
import { markPlace } from '../lib/skills/markPlace';
import { resolvePlace } from '../lib/skills/resolvePlace';
import { requestMapFocus } from '../data/mapFocus';
import { setDataPackMapLayerEnabled } from '../lib/dataPack';
import MapPlacementField from './MapPlacementField';
import type { GeoHit } from '../lib/skills/resolvePlace';
import { decideTextPlacementOnDevice } from '../lib/skills/suggestMapPlacement';

// 音乐 Skill 的「曲库」视图：数据包声明 OSS/外部直链时用 audio，声明 YouTube 时用官方嵌入播放。
// 音源失效时明确报错，绝不替换成与曲目无关的演示音频。

const slug = (s: string) => (s || '').replace(/[\s·\-—:：,，.。!！?？'"'']/g, '').slice(0, 16);

export default function MusicLibraryView() {
  const [, refreshCatalog] = useReducer((value) => value + 1, 0);
  const [by, setBy] = useState<GroupKey>('region');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [curId, setCurId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [stageTrackId, setStageTrackId] = useState<string | null>(null); // 进入沉浸式电台（音乐形态）
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [published, setPublished] = useState<PublishedMusicCard | null>(null);
  const [publishedPlace, setPublishedPlace] = useState('');
  const [publishedGeo, setPublishedGeo] = useState<PublishedMusicCard['geo']>(null);
  const [publishedRole, setPublishedRole] = useState<'artist_origin' | 'song_city'>('artist_origin');
  const [publishedPlacementSource, setPublishedPlacementSource] = useState('云端 Qwen 音乐卡候选');
  const [publishedPlacementEvidence, setPublishedPlacementEvidence] = useState('');
  const [trackPlacementOpen, setTrackPlacementOpen] = useState(false);
  const [trackPlace, setTrackPlace] = useState('');
  const [trackGeo, setTrackGeo] = useState<{ place: string; lng: number; lat: number } | null>(null);
  const [trackRole, setTrackRole] = useState<'artist_origin' | 'song_city'>('song_city');
  const [trackPlacementSource, setTrackPlacementSource] = useState('本地音乐 Data Pack 候选');
  const [trackPlacementEvidence, setTrackPlacementEvidence] = useState('');
  const [trackSuggesting, setTrackSuggesting] = useState(false);
  const trackPlacementToken = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playingRef = useRef(false);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => {
    void ensureMusicCatalog();
    return subscribeMusicCatalog(refreshCatalog);
  }, []);
  useEffect(() => subscribeUserMarks(refreshCatalog), []);

  const groups = useMemo(() => groupSongs(by), [by, songTotal]);
  const artistFlat = useMemo(() => [...songs].sort((a, b) => a.artist.localeCompare(b.artist, 'zh') || a.title.localeCompare(b.title, 'zh')), [songTotal]);
  const firstMappedCity = RADIO_CITIES.find((city) => Number.isFinite(city.lng) && Number.isFinite(city.lat));
  const userMusicCards = getUserMarksByKind('music');

  const viewOnMap = (lng?: number, lat?: number) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    setDataPackMapLayerEnabled('music', true);
    requestMapFocus(lng!, lat!, 8.8);
  };

  // 切分组维度时，默认展开第一组
  useEffect(() => { setOpen(new Set(groups[0] ? [groups[0].key] : [])); }, [by, groups]);

  const cur = useMemo(() => (curId ? resolveTracksByIds([curId])[0] : null) as ResolvedTrack | undefined, [curId, songTotal]);

  useEffect(() => {
    setTrackPlacementOpen(false);
    setTrackPlace(cur?.cityNameZh || '');
    const city = cur ? RADIO_CITIES.find((item) => item.cityNameZh === cur.cityNameZh) : undefined;
    setTrackGeo(city && Number.isFinite(city.lat) && Number.isFinite(city.lng)
      ? { place: cur!.cityNameZh, lng: city.lng as number, lat: city.lat as number }
      : null);
    setTrackRole('song_city');
    setTrackPlacementSource('本地音乐 Data Pack 候选');
    setTrackPlacementEvidence('');
    setTrackSuggesting(false);
    trackPlacementToken.current += 1;
  }, [cur]);

  // 切歌：只把 OSS/外部音频直链交给 audio；YouTube 由下方 iframe 播放。
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !cur) return;
    const directUrl = directAudioUrl(cur.playback);
    setSourceError(null);
    a.pause();
    a.removeAttribute('src');
    if (!directUrl) {
      a.load();
      if (!youtubeVideoId(cur.playback)) {
        setSourceError('音源不可用');
        setPlaying(false);
      }
      return;
    }
    a.src = directUrl;
    a.load();
    const fail = () => {
      setSourceError('原曲音源暂不可用');
      setPlaying(false);
    };
    if (playingRef.current) a.play().catch(fail);
    a.addEventListener('error', fail);
    const t = window.setTimeout(() => { if (a.readyState < 2) fail(); }, 7000);
    return () => { window.clearTimeout(t); a.removeEventListener('error', fail); };
  }, [curId, cur]);
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !cur || youtubeVideoId(cur.playback)) return;
    if (playing) a.play().catch(() => { setSourceError('原曲音源暂不可用'); setPlaying(false); });
    else a.pause();
  }, [playing, cur]);

  const [pinMsg, setPinMsg] = useState<string | null>(null);

  const publishYoutube = async () => {
    const value = youtubeUrl.trim();
    if (!value || publishBusy) return;
    setPublishBusy(true); setPublishError(''); setPublished(null);
    try {
      const card = await publishYoutubeMusicUrl(value);
      const placement = await decideTextPlacementOnDevice({
        domain: '音乐卡片', title: card.title,
        text: [
          card.artist ? `歌手：${card.artist}` : '',
          card.genre ? `类型：${card.genre}` : '',
          card.country ? `国家：${card.country}` : '',
          card.songIntro ? `歌曲简介：${card.songIntro}` : '',
          card.artistIntro ? `歌手简介：${card.artistIntro}` : '',
        ].filter(Boolean).join('\n'),
        roles: [{ value: 'artist_origin', label: '歌手地' }, { value: 'song_city', label: '歌曲地' }],
        candidate: card.place ? { place: card.place, role: card.geoKind, evidence: '云端音乐卡候选' } : undefined,
      });
      setPublished(card);
      setPublishedPlace(placement?.geo.place || card.place || card.geo?.place || '');
      setPublishedGeo(placement?.geo || card.geo);
      setPublishedRole((placement?.role as 'artist_origin' | 'song_city' | undefined) || card.geoKind);
      setPublishedPlacementSource(placement ? '端侧 Qwen-2B 决策' : '云端 Qwen 音乐卡候选');
      setPublishedPlacementEvidence(placement?.evidence || '云端根据歌曲与歌手资料生成候选；仍需你确认。');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'music_publish_failed';
      setPublishError(message === 'music_publish_busy' ? '服务器正在处理上一首，请稍后再试' : `生成失败 · ${message}`);
    } finally { setPublishBusy(false); }
  };

  const pinPublished = async () => {
    if (!published) return;
    let geo = publishedGeo;
    if (!geo && publishedPlace.trim()) {
      const hit = await resolvePlace(publishedPlace.trim());
      if (hit) geo = { lng: hit.lng, lat: hit.lat, place: hit.place };
    }
    if (!geo) { setPinMsg('先填写可定位的歌手城市'); window.setTimeout(() => setPinMsg(null), 2000); return; }
    const result = markPlace({
      kind: 'music', prefix: 'umy-', key: published.id, label: published.title, amp: 0.45,
      geo,
      meta: {
        title: published.title, track: published.title, artist: published.artist,
        genre: published.genre, year: published.year, city: publishedPlace || published.place,
        place: publishedPlace || published.place, country: published.country, geoKind: publishedRole,
        songIntro: published.songIntro, artistIntro: published.artistIntro,
        audioUrl: directAudioUrl(published.playback), playback: published.playback,
        sourceUrl: published.sourceUrl, durationSec: published.durationSec, model: published.model,
      },
    });
    recordSignals('music', { cities: [publishedPlace || published.place].filter(Boolean), artists: [published.artist].filter(Boolean), genres: [published.genre].filter(Boolean) });
    setPinMsg(result.reason === 'exists' ? `已在地球上 · ${publishedPlace || published.place}` : `已钉到地球 · ${publishedPlace || published.place}`);
    setDataPackMapLayerEnabled('music', true);
    requestMapFocus(geo.lng, geo.lat, 8.8);
    setPublished(null);
    setPublishedPlace('');
    setPublishedGeo(null);
    setPublishedPlacementSource('云端 Qwen 音乐卡候选');
    setPublishedPlacementEvidence('');
    setYoutubeUrl('');
    window.setTimeout(() => setPinMsg(null), 2000);
  };

  const playSong = (id: string) => {
    if (id === curId) { setPlaying((p) => !p); return; }
    const resolved = resolveTracksByIds([id])[0];
    setCurId(id);
    setPlaying(canPlayMusicSource(resolved?.playback));
    setSourceError(canPlayMusicSource(resolved?.playback) ? null : '这条数据没有可用的原曲来源');
    const s = songs.find((x) => x.id === id);   // 记一次收听 → 听歌记忆库 + 回流口味画像（含 genre/city）
    if (s) recordPlay({ id: s.id, title: s.title, artist: s.artist, genre: s.genre, city: s.city });
  };

  const toggleTrackPlacement = async () => {
    if (!cur) return;
    if (trackPlacementOpen) {
      trackPlacementToken.current += 1;
      setTrackPlacementOpen(false); setTrackSuggesting(false);
      return;
    }
    const token = trackPlacementToken.current + 1;
    trackPlacementToken.current = token;
    const sourceSong = songs.find((song) => song.id === cur.id);
    setTrackPlacementOpen(true); setTrackSuggesting(true);
    setTrackPlacementSource('端侧 Qwen-2B 决策中');
    setTrackPlacementEvidence('正在根据歌曲、歌手和本地城市候选决定落位类型。');
    const placement = await decideTextPlacementOnDevice({
      domain: '音乐卡片', title: cur.title,
      text: [`歌手：${cur.artist}`, sourceSong?.genre ? `类型：${sourceSong.genre}` : ''].filter(Boolean).join('\n'),
      roles: [{ value: 'artist_origin', label: '歌手地' }, { value: 'song_city', label: '歌曲地' }],
      candidate: cur.cityNameZh ? { place: cur.cityNameZh, role: 'song_city', evidence: '本地音乐 Data Pack 关联城市' } : undefined,
    });
    if (trackPlacementToken.current !== token) return;
    setTrackSuggesting(false);
    if (!placement) {
      setTrackPlacementSource('本地音乐 Data Pack 候选');
      setTrackPlacementEvidence(`端侧 2B 没有返回更可靠的决定，保留 ${cur.cityNameZh || '空地点'} 供你确认或修改。`);
      return;
    }
    setTrackPlace(placement.geo.place);
    setTrackGeo(placement.geo);
    setTrackRole(placement.role as 'artist_origin' | 'song_city');
    setTrackPlacementSource('端侧 Qwen-2B 决策');
    setTrackPlacementEvidence(placement.evidence);
  };

  // 把当前歌曲钉到确认后的地点；本地 Data Pack 只给默认建议，用户可改后再写地图。
  const pinTrack = () => {
    if (!cur) return;
    if (!trackGeo) { setPinMsg('先确认一个可定位的城市或地区'); window.setTimeout(() => setPinMsg(null), 1800); return; }
    const sourceSong = songs.find((song) => song.id === cur.id);
    const result = markPlace({
      kind: 'music', prefix: 'umu-', key: `${slug(cur.artist)}-${slug(cur.title)}`, label: cur.title, amp: 0.6,
      geo: trackGeo,
      meta: {
        trackId: cur.id, track: cur.title, title: cur.title, artist: cur.artist,
        city: trackGeo.place, place: trackGeo.place, geoKind: trackRole, genre: sourceSong?.genre || '',
      },
    });
    recordSignals('music', { cities: [trackGeo.place], artists: [cur.artist] });
    setPinMsg(result.reason === 'exists' ? `已在地球上 · ${trackGeo.place}` : `已钉到地球 · ${trackGeo.place}`);
    setTrackPlacementOpen(false);
    requestMapFocus(trackGeo.lng, trackGeo.lat, 8.8);
    window.setTimeout(() => setPinMsg(null), 1800);
  };
  const toggle = (k: string) => setOpen((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const Row = (s: Song, showArtistFirst = false) => {
    const active = s.id === curId;
    return (
      <div key={s.id} className={`flex items-stretch border-b border-black/10 transition-colors ${active ? 'bg-[#00ff88]/15' : 'bg-white'}`}>
        <button type="button" onClick={() => playSong(s.id)}
          className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left hover:bg-[#00ff88]/8 active:bg-[#00ff88]/20">
          <div className="w-7 h-7 shrink-0 bg-black flex items-center justify-center border border-black shadow-[1px_1px_0_#00ff88]">
            {active && playing ? <Pause className="w-3.5 h-3.5 text-[#00ff88]" fill="currentColor" strokeWidth={0} /> : <Play className="w-3.5 h-3.5 text-[#00ff88] ml-0.5" fill="currentColor" strokeWidth={0} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-bold truncate leading-tight">{showArtistFirst ? s.artist : s.title}</div>
            <div className="text-[10px] text-black/50 truncate">{showArtistFirst ? s.title : s.artist}</div>
          </div>
          <div className="shrink-0 flex items-center gap-1">
            <span className="font-pixel text-[6px] text-black/40 border border-black/20 px-1 py-0.5">{s.genre}</span>
            <span className="font-pixel text-[6px] text-black/35 w-12 text-right truncate">{s.city}</span>
          </div>
        </button>
        <button type="button" onClick={() => viewOnMap(s.lng, s.lat)} disabled={!Number.isFinite(s.lng) || !Number.isFinite(s.lat)}
          aria-label={`在地图上查看「${s.title}」`}
          title="在地图上查看"
          className="m-1.5 ml-0 flex h-8 w-8 shrink-0 items-center justify-center border border-black/35 bg-transparent text-[#168654] active:border-black active:bg-[#00ff88] disabled:text-black/20">
          <LocateFixed className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] min-h-0 relative">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="px-3 py-2.5 border-b-2 border-black bg-[#F5F2E9] text-[#168654] shrink-0">
        <div className="font-pixel text-[7px] flex justify-between items-center tracking-wider">
          <span>曲目 {songTotal}</span><span className="text-black/20">|</span>
          <span>城市 {RADIO_CITIES.length}</span><span className="text-black/20">|</span>
          <span>Skill 可换数据</span>
        </div>
        <div className="mt-2">
          <DataPackManager
            domain="music"
            accent="#7CFF6B"
            compactLabel="音乐数据包"
            mapPlacementCount={songTotal}
            mapFocus={firstMappedCity ? { lng: firstMappedCity.lng!, lat: firstMappedCity.lat!, zoom: 7.4 } : undefined}
          />
        </div>
      </div>
      {/* 输入 YouTube → 服务端音频 → Qwen 音乐卡 → 用户确认钉地球。 */}
      <div className="px-3 py-2.5 border-b-2 border-black bg-white space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="font-pixel text-[8px] tracking-widest">ADD FROM YOUTUBE</div>
          <div className="font-pixel text-[6px] text-[#168654]">SERVER AUDIO · QWEN 3.7 MAX</div>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Link2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-black/35" strokeWidth={2.5} />
            <input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void publishYoutube()}
              placeholder="粘贴 YouTube 音乐链接"
              className="w-full border-2 border-black bg-[#EAEAEA] py-2 pl-7 pr-2 text-[11px] focus:bg-white focus:outline-none" />
          </div>
          <button onClick={() => void publishYoutube()} disabled={!youtubeUrl.trim() || publishBusy}
            className="min-w-[76px] border-2 border-black bg-[#00ff88] px-2 py-1.5 text-[10px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-40">
            {publishBusy ? <span className="flex items-center justify-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" />处理中</span> : '标记音乐'}
          </button>
        </div>
        {publishBusy && <div className="font-pixel text-[6px] tracking-wider text-black/45">服务端下载 → M4A → OSS → Qwen 简介 → 城市定位</div>}
        {publishError && <div className="border border-[#d23b3b] bg-[#fff0ed] px-2 py-1 text-[9px] text-[#b42b2b]">{publishError}</div>}
        {published && (
          <div className="border-2 border-black bg-[#FFFDF0] shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="flex items-center justify-between bg-black px-2.5 py-1.5 text-[#00ff88]">
              <span className="font-pixel text-[7px] tracking-widest">MUSIC CARD · 待确认</span>
              <span className="font-pixel text-[6px]">{published.model}</span>
            </div>
            <div className="px-2.5 py-2 space-y-2">
              <div>
                <div className="text-[14px] font-bold leading-tight">{published.title}</div>
                <div className="mt-0.5 text-[10px] text-black/55">{published.artist}{published.year ? ` · ${published.year}` : ''}{published.genre ? ` · ${published.genre}` : ''}</div>
              </div>
              {!!directAudioUrl(published.playback) && <audio controls preload="metadata" src={directAudioUrl(published.playback)} className="h-8 w-full" />}
              {published.songIntro && <div className="text-[10px] leading-relaxed text-black/75"><span className="font-bold">歌曲：</span>{published.songIntro}</div>}
              {published.artistIntro && <div className="text-[10px] leading-relaxed text-black/65"><span className="font-bold">歌手：</span>{published.artistIntro}</div>}
              <MapPlacementField
                place={publishedPlace}
                hit={publishedGeo}
                role={publishedRole}
                roles={[{ value: 'artist_origin', label: '歌手地' }, { value: 'song_city', label: '歌曲地' }]}
                accent="#00ff88"
                sourceLabel={publishedPlacementSource}
                evidence={publishedPlacementEvidence}
                onPlaceChange={(place) => { setPublishedPlace(place); setPublishedGeo(null); setPublishedPlacementSource('手动选择'); setPublishedPlacementEvidence(''); }}
                onRoleChange={(role) => setPublishedRole(role as 'artist_origin' | 'song_city')}
                onResolved={(hit: GeoHit) => { setPublishedPlace(hit.place); setPublishedGeo({ place: hit.place, lng: hit.lng, lat: hit.lat }); }}
                placeholder="歌手城市 / 歌曲城市"
              />
              <button onClick={() => void pinPublished()} disabled={!publishedGeo}
                className="flex w-full items-center justify-center gap-1 border-2 border-black bg-[#00ff88] px-2.5 py-1.5 text-[10px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-35">
                <MapPin className="w-3.5 h-3.5" strokeWidth={2.5} /> 确认 · 钉到地球
              </button>
            </div>
          </div>
        )}
      </div>
      {/* 分组维度切换 */}
      <div className="px-3 py-2 border-b-2 border-black bg-white shrink-0 flex items-center gap-2">
        <Music2 className="w-3.5 h-3.5 text-black/45 shrink-0" strokeWidth={2.5} />
        <div className="flex border-2 border-black bg-[#EAEAEA] p-0.5 flex-1">
          {GROUP_LABELS.map((g) => (
            <button key={g.key} onClick={() => setBy(g.key)}
              className={`flex-1 py-1 text-[10px] font-bold ${by === g.key ? 'bg-black text-[#7CFF6B]' : 'text-black hover:bg-black/5'}`}>{g.label}</button>
          ))}
        </div>
        <span className="font-pixel text-[7px] text-black/40 shrink-0">{songTotal}</span>
      </div>

      {/* 列表 */}
      <div>
        {!!userMusicCards.length && (
          <section className="border-b-2 border-black bg-[#f2fff7]">
            <div className="flex items-center justify-between bg-black px-3 py-1.5 text-[#00ff88]">
              <span className="font-pixel text-[7px] tracking-widest">MY MUSIC · 已确认卡片</span>
              <span className="font-pixel text-[7px]">{userMusicCards.length}</span>
            </div>
            {userMusicCards.map((mark) => {
              const meta = (mark.meta || {}) as Record<string, unknown>;
              return (
                <article key={mark.id} className="flex items-stretch border-b border-black/15 bg-white last:border-b-0">
                  <div className="min-w-0 flex-1 px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 bg-[#00ff88]" />
                      <div className="truncate text-[12px] font-bold">{mark.label || String(meta.track || meta.title || '我的音乐')}</div>
                      <span className="shrink-0 font-pixel text-[6px] text-[#168654]">NEW</span>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-black/50">
                      {[meta.artist, meta.city || meta.place, meta.genre].filter(Boolean).map(String).join(' · ')}
                    </div>
                  </div>
                  <button type="button" onClick={() => viewOnMap(mark.lng, mark.lat)}
                    aria-label={`在地图上查看「${mark.label || '我的音乐'}」`} title="在地图上查看"
                    className="m-1.5 ml-0 flex h-8 w-8 shrink-0 items-center justify-center border border-black/35 bg-transparent text-[#168654] active:border-black active:bg-[#00ff88]">
                    <LocateFixed className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </article>
              );
            })}
          </section>
        )}
        {songTotal === 0 ? (
          <div className="m-3 border-2 border-black bg-white px-4 py-5 text-center shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="text-[12px] font-bold">示例音乐库已关闭</div>
            <div className="mt-1 text-[10px] leading-relaxed text-black/45">打开上方“示例库 OFF”，城市与曲目会立即恢复；本机缓存仍保留。</div>
          </div>
        ) : by === 'artist' ? (
          <div className="bg-white">{artistFlat.map((s) => Row(s, true))}</div>
        ) : (
          groups.map((grp) => {
            const isOpen = open.has(grp.key);
            return (
              <div key={grp.key} className="border-b-2 border-black/15">
                <button onClick={() => toggle(grp.key)} className="w-full flex items-center gap-2 px-3 py-2 bg-white sticky top-0 z-10 active:bg-black/5">
                  <div className="w-2.5 h-2.5 bg-[#00ff88] border border-black shrink-0" />
                  <span className="font-pixel text-[10px] tracking-wide flex-1 text-left truncate">{grp.key}</span>
                  <span className="font-pixel text-[7px] text-black/40">{grp.songs.length}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-black/50 transition-transform ${isOpen ? 'rotate-180' : ''}`} strokeWidth={2.5} />
                </button>
                {isOpen && <div className="bg-white">{grp.songs.map((s) => Row(s))}</div>}
              </div>
            );
          })
        )}
        <div className="text-center text-[8px] font-pixel text-black/30 py-3 tracking-widest">{songTotal} 首 · 按 {GROUP_LABELS.find((g) => g.key === by)?.label} 归类 · 点条目播放</div>
      </div>
      </div>

      {/* 迷你播放条 */}
      {cur && (
        <div className="border-t-2 border-black bg-black text-[#7CFF6B] shrink-0">
          {youtubeVideoId(cur.playback) && (
            <YouTubePlaybackFrame playback={cur.playback} playing={playing} title={cur.title} className="h-36 w-full border-b border-[#7CFF6B]/35" />
          )}
          <div className="px-3 py-2 flex items-center gap-2.5">
          <div className="w-9 h-9 shrink-0 border border-[#7CFF6B]/50 bg-[#0a0a0a] overflow-hidden">{cur.cover && <img src={cur.cover} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-white truncate">{cur.title}<span className="text-white/45"> · {cur.artist}</span></div>
            <div className={`font-pixel text-[6px] tracking-wider truncate mt-0.5 ${sourceError ? 'text-[#ff8a76]' : 'text-[#7CFF6B]/70'}`}>{sourceError || `${cur.cityNameZh} · ${musicSourceLabel(cur.playback)}`}</div>
          </div>
          <button onClick={() => setPlaying((p) => !p)} disabled={!canPlayMusicSource(cur.playback)} className="w-9 h-9 border-2 border-[#7CFF6B] flex items-center justify-center active:scale-95 disabled:opacity-30">{playing ? <Pause className="w-4 h-4" fill="currentColor" strokeWidth={0} /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" strokeWidth={0} />}</button>
          {/* 把这首歌钉到它的城市（让地球长出「我的音乐」点） */}
          <button onClick={() => void toggleTrackPlacement()} title="让端侧 Qwen-2B 决定地点后钉到地球" className="w-9 h-9 border-2 border-[#7CFF6B] flex items-center justify-center active:scale-95"><MapPin className="w-4 h-4" strokeWidth={2.5} /></button>
          {/* 进入沉浸式电台（城市封面 + DJ 开关 + 与 frost 对话） */}
          <button onClick={() => { setPlaying(false); setStageTrackId(curId); }} title="进入电台（沉浸播放）" className="w-9 h-9 border-2 border-[#7CFF6B] flex items-center justify-center active:scale-95"><Maximize2 className="w-4 h-4" strokeWidth={2.5} /></button>
          </div>
          {trackPlacementOpen && (
            <div className="border-t border-[#7CFF6B]/35 bg-[#101010] px-3 py-2 text-black">
              <MapPlacementField
                place={trackPlace}
                hit={trackGeo}
                role={trackRole}
                roles={[{ value: 'artist_origin', label: '歌手地' }, { value: 'song_city', label: '歌曲地' }]}
                accent="#7CFF6B"
                sourceLabel={trackPlacementSource}
                evidence={trackPlacementEvidence || `曲库把「${cur.title}」关联到 ${cur.cityNameZh || '未知城市'}；可以按你的记忆手动调整。`}
                suggesting={trackSuggesting}
                onPlaceChange={(place) => { trackPlacementToken.current += 1; setTrackSuggesting(false); setTrackPlace(place); setTrackGeo(null); setTrackPlacementSource('手动选择'); setTrackPlacementEvidence(''); }}
                onRoleChange={(role) => setTrackRole(role as 'artist_origin' | 'song_city')}
                onResolved={(hit: GeoHit) => { setTrackPlace(hit.place); setTrackGeo({ place: hit.place, lng: hit.lng, lat: hit.lat }); }}
              />
              <button onClick={pinTrack} disabled={!trackGeo} className="mt-2 w-full border-2 border-[#7CFF6B] bg-black py-1.5 text-[9px] font-bold text-[#7CFF6B] disabled:opacity-35">确认地点 · 钉到地球</button>
            </div>
          )}
        </div>
      )}
      {pinMsg && <div className="absolute left-1/2 -translate-x-1/2 bottom-20 z-50 border-2 border-black bg-black text-[#7CFF6B] text-[11px] px-3 py-1.5 shadow-[2px_2px_0_#000]">{pinMsg}</div>}
      <audio ref={audioRef} onEnded={() => setPlaying(false)} />

      {/* 沉浸式电台播放台（音乐形态进入；可切 DJ 开/关、音乐/播客） */}
      <RadioStage isOpen={!!stageTrackId} onClose={() => setStageTrackId(null)} startTrackId={stageTrackId ?? undefined} startMode="music" />
    </div>
  );
}
