import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { AdminLayout } from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { adminService } from '../services/adminService';
import type {
  AdminMovieSummaryDto,
  AdminShowSummaryDto,
  HomeSectionDto,
  HomeSectionImportSpec,
  HomeSectionItemDto,
  HomeSectionKind,
  HomeSectionListPreview,
  HomeSectionRule,
  RulePreviewItem,
} from '../lib/types';

const KIND_LABEL: Record<HomeSectionKind, string> = {
  RECENT: 'الأحدث (تلقائي)',
  POPULAR: 'الأكثر شعبية (تلقائي)',
  TOP_RATED: 'الأعلى تقييماً (تلقائي)',
  SERIES: 'المسلسلات (تلقائي)',
  CUSTOM: 'قائمة مخصصة',
  RULE: 'قسم ذكي (يتحدّث تلقائياً)',
};

const BUILTIN_DEFAULTS: Record<
  Exclude<HomeSectionKind, 'CUSTOM' | 'RULE'>,
  { ar: string; en: string }
> = {
  RECENT: { ar: 'الأحدث', en: 'Recently Added' },
  POPULAR: { ar: 'الأكثر شعبية', en: 'Trending' },
  TOP_RATED: { ar: 'الأعلى تقييمًا', en: 'Top Rated' },
  SERIES: { ar: 'المسلسلات', en: 'TV Shows' },
};

const PRESET_LABEL: Record<string, string> = {
  'top-rated-movies': 'أفضل الأفلام في التاريخ (الأعلى تقييماً)',
  'popular-movies': 'الأفلام الأكثر شعبية',
  'now-playing-movies': 'أفلام تُعرض الآن في السينما',
  'upcoming-movies': 'أفلام قادمة',
  'trending-movies-week': 'أفلام رائجة هذا الأسبوع',
  'top-rated-tv': 'أفضل المسلسلات في التاريخ (الأعلى تقييماً)',
  'popular-tv': 'المسلسلات الأكثر شعبية',
  'on-the-air-tv': 'مسلسلات تُعرض حالياً',
  'trending-tv-week': 'مسلسلات رائجة هذا الأسبوع',
};

const inputCls = 'px-3 py-2 rounded-lg text-xs bg-black border border-zinc-800 text-white';
const btnCls = 'px-3 py-2 rounded-lg text-xs font-bold border border-zinc-700 hover:bg-zinc-800';

type ImportSource = 'preset' | 'list' | 'discover' | 'imdb';

// Every distinct IMDb title id (tt1234567) in a pasted text / exported CSV / page source, in order of appearance.
function extractImdbIds(text: string): string[] {
  return [...new Set(text.match(/tt\d{7,10}/g) ?? [])];
}

const LANGUAGE_AR: Record<string, string> = {
  ar: 'العربية',
  tr: 'التركية',
  en: 'الإنجليزية',
  es: 'الإسبانية',
  fr: 'الفرنسية',
  de: 'الألمانية',
  it: 'الإيطالية',
  hi: 'الهندية',
  ko: 'الكورية',
  ja: 'اليابانية',
  zh: 'الصينية',
  cn: 'الصينية',
  ru: 'الروسية',
  pt: 'البرتغالية',
  fa: 'الفارسية',
  ur: 'الأردية',
  th: 'التايلاندية',
  he: 'العبرية',
  nl: 'الهولندية',
  sv: 'السويدية',
  pl: 'البولندية',
  id: 'الإندونيسية',
};
const LANGUAGE_EN: Record<string, string> = {
  ar: 'Arabic',
  tr: 'Turkish',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  hi: 'Hindi',
  ko: 'Korean',
  ja: 'Japanese',
  zh: 'Chinese',
  cn: 'Chinese',
  ru: 'Russian',
  pt: 'Portuguese',
  fa: 'Persian',
  ur: 'Urdu',
  th: 'Thai',
  he: 'Hebrew',
  nl: 'Dutch',
  sv: 'Swedish',
  pl: 'Polish',
  id: 'Indonesian',
};
const MEDIA_LABEL: Record<HomeSectionRule['media'], { ar: string; en: string }> = {
  movie: { ar: 'الأفلام', en: 'Movies' },
  series: { ar: 'المسلسلات', en: 'Series' },
  all: { ar: 'الأفلام والمسلسلات', en: 'Movies & Series' },
};
const SORT_LABEL: Record<HomeSectionRule['sort'], string> = {
  newest: 'الأحدث إصداراً',
  rating: 'الأعلى تقييماً',
  popularity: 'الأكثر شعبية',
};

function ruleTitles(rule: HomeSectionRule): { ar: string; en: string } {
  // (the minimum rating is a filter, not part of the auto name)
  const media = MEDIA_LABEL[rule.media];
  const langAr = rule.language ? ` ${LANGUAGE_AR[rule.language] ?? rule.language}` : '';
  const langEn = rule.language ? `${LANGUAGE_EN[rule.language] ?? rule.language} ` : '';
  if (rule.sort === 'newest')
    return { ar: `أحدث ${media.ar}${langAr}`, en: `Newest ${langEn}${media.en}` };
  if (rule.sort === 'rating')
    return { ar: `${media.ar}${langAr} الأعلى تقييماً`, en: `Top Rated ${langEn}${media.en}` };
  return { ar: `${media.ar}${langAr} الأكثر شعبية`, en: `Most Popular ${langEn}${media.en}` };
}

// A row defined by a rule ("newest Arabic movies") instead of a fixed list: the app recomputes it from the
// live catalog every time, so it never goes stale and new imports appear in it by themselves.
function SmartSectionForm({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (input: {
    titleAr: string;
    titleEn: string;
    maxItems: number;
    rule: HomeSectionRule;
  }) => void;
}) {
  const [media, setMedia] = useState<HomeSectionRule['media']>('movie');
  const [sort, setSort] = useState<HomeSectionRule['sort']>('newest');
  const [language, setLanguage] = useState('');
  const [genre, setGenre] = useState('');
  const [country, setCountry] = useState('');
  const [person, setPerson] = useState('');
  const [collection, setCollection] = useState('');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [count, setCount] = useState('20');
  const [minRating, setMinRating] = useState('');
  const [minVotes, setMinVotes] = useState('');
  const [preview, setPreview] = useState<RulePreviewItem[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [languages, setLanguages] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [titleAr, setTitleAr] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [namesEdited, setNamesEdited] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([adminService.listMovieFilterOptions(), adminService.listShowFilterOptions()])
      .then(([m, sh]) => {
        setLanguages([...new Set([...m.languages, ...sh.languages])].filter(Boolean).sort());
        setGenres([...new Set([...m.genres, ...sh.genres])].filter(Boolean).sort());
      })
      .catch(() => undefined);
  }, []);

  const rule: HomeSectionRule = {
    media,
    sort,
    language: language || undefined,
    genre: genre || undefined,
    country: country || undefined,
    person: person || undefined,
    collection: collection || undefined,
    yearFrom: Number(yearFrom) >= 1888 ? Number(yearFrom) : undefined,
    yearTo: Number(yearTo) >= 1888 ? Number(yearTo) : undefined,
    minRating: Number(minRating) > 0 ? Number(minRating) : undefined,
    minVotes: minVotes !== '' && Number(minVotes) >= 0 ? Number(minVotes) : undefined,
  };
  const ruleKey = JSON.stringify(rule);
  const suggested = ruleTitles(rule);
  useEffect(() => {
    if (!namesEdited) {
      setTitleAr(suggested.ar);
      setTitleEn(suggested.en);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, sort, language, genre, country, person, collection, yearFrom, yearTo, namesEdited]);

  async function generateWithAi() {
    if (aiPrompt.trim().length < 3) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const plan = await adminService.planAiHomeSection(aiPrompt.trim());
      setMedia(plan.rule.media);
      setSort(plan.rule.sort);
      setLanguage(plan.rule.language ?? '');
      setGenre(plan.rule.genre ?? '');
      setCountry(plan.rule.country ?? '');
      setPerson(plan.rule.person ?? '');
      setCollection(plan.rule.collection ?? '');
      setYearFrom(plan.rule.yearFrom?.toString() ?? '');
      setYearTo(plan.rule.yearTo?.toString() ?? '');
      setMinRating(plan.rule.minRating?.toString() ?? '');
      setMinVotes(plan.rule.minVotes?.toString() ?? '');
      setCount(plan.maxItems.toString());
      setNamesEdited(true);
      setTitleAr(plan.titleAr);
      setTitleEn(plan.titleEn);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'تعذّر إنشاء اقتراح القسم.');
    } finally {
      setAiBusy(false);
    }
  }

  // Shows what the row would contain right now, so an empty result is obvious before the row is created.
  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      adminService
        .previewHomeRule(JSON.parse(ruleKey) as HomeSectionRule, 12)
        .then((items) => !cancelled && setPreview(items))
        .catch(() => !cancelled && setPreview(null))
        .finally(() => !cancelled && setPreviewLoading(false));
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ruleKey]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void generateWithAi()}
          placeholder="مثال: أفضل 50 فيلماً عربياً كلاسيكياً أو أفلام عادل إمام"
          className={`${inputCls} min-w-[320px] flex-1`}
        />
        <button
          className={btnCls}
          disabled={busy || aiBusy || aiPrompt.trim().length < 3}
          onClick={() => void generateWithAi()}
        >
          {aiBusy ? 'جارٍ التحليل…' : 'إنشاء الشروط بالذكاء الاصطناعي'}
        </button>
      </div>
      {aiError && <p className="text-xs text-red-400">{aiError}</p>}
      <p className="text-[11px] text-zinc-500">
        يحوّل الوصف إلى فلاتر قابلة للمراجعة والتعديل. محتوى القسم يتجدد تلقائياً مع تحديث الكتالوج.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={media}
          onChange={(e) => setMedia(e.target.value as HomeSectionRule['media'])}
          className={inputCls}
        >
          <option value="movie">أفلام</option>
          <option value="series">مسلسلات</option>
          <option value="all">أفلام ومسلسلات</option>
        </select>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls}>
          <option value="">كل اللغات</option>
          {languages.map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_AR[code] ?? code}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as HomeSectionRule['sort'])}
          className={inputCls}
        >
          {(Object.keys(SORT_LABEL) as Array<HomeSectionRule['sort']>).map((key) => (
            <option key={key} value={key}>
              {SORT_LABEL[key]}
            </option>
          ))}
        </select>
        <select value={genre} onChange={(e) => setGenre(e.target.value)} className={inputCls}>
          <option value="">كل التصنيفات</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="الدولة"
          className={`${inputCls} w-32`}
        />
        <input
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          placeholder="ممثل أو مخرج"
          className={`${inputCls} w-40`}
        />
        <input
          value={collection}
          onChange={(e) => setCollection(e.target.value)}
          placeholder="سلسلة أفلام"
          className={`${inputCls} w-40`}
        />
        <label className="text-xs text-zinc-400 flex items-center gap-2">
          السنوات
          <input
            value={yearFrom}
            onChange={(e) => setYearFrom(e.target.value)}
            placeholder="من"
            className={`${inputCls} w-16`}
            dir="ltr"
          />
          <input
            value={yearTo}
            onChange={(e) => setYearTo(e.target.value)}
            placeholder="إلى"
            className={`${inputCls} w-16`}
            dir="ltr"
          />
        </label>
        <label className="text-xs text-zinc-400 flex items-center gap-2">
          عدد العناصر
          <input
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className={`${inputCls} w-16`}
            dir="ltr"
          />
        </label>
        <label className="text-xs text-zinc-400 flex items-center gap-2">
          أقل تقييم (اختياري)
          <input
            value={minRating}
            onChange={(e) => setMinRating(e.target.value)}
            placeholder="7"
            className={`${inputCls} w-16`}
            dir="ltr"
          />
        </label>
        <label className="text-xs text-zinc-400 flex items-center gap-2">
          أقل عدد أصوات (اختياري)
          <input
            value={minVotes}
            onChange={(e) => setMinVotes(e.target.value)}
            placeholder="تلقائي"
            className={`${inputCls} w-20`}
            dir="ltr"
          />
        </label>
      </div>
      <div className="text-[11px] text-zinc-500">
        {previewLoading ? (
          <span className="flex items-center gap-1.5">
            <Loader2 size={11} className="animate-spin" /> جارٍ حساب النتائج...
          </span>
        ) : preview === null ? null : preview.length === 0 ? (
          <span className="text-amber-400">
            لا توجد أعمال مطابقة حالياً - خفّف الشروط (أقل تقييم / تصنيف).
          </span>
        ) : (
          <span>
            المعاينة ({preview.length}+):{' '}
            {preview
              .map((p) => `${p.title}${p.rating ? ` ★${p.rating.toFixed(1)}` : ''}`)
              .join(' · ')}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={titleAr}
          onChange={(e) => {
            setNamesEdited(true);
            setTitleAr(e.target.value);
          }}
          placeholder="الاسم بالعربية"
          className={`${inputCls} w-64`}
        />
        <input
          value={titleEn}
          onChange={(e) => {
            setNamesEdited(true);
            setTitleEn(e.target.value);
          }}
          placeholder="Name in English"
          className={`${inputCls} w-64`}
          dir="ltr"
        />
      </div>
      <button
        className={`${btnCls} bg-white text-black`}
        disabled={busy || !titleAr.trim() || !titleEn.trim()}
        onClick={() =>
          onCreate({
            titleAr: titleAr.trim(),
            titleEn: titleEn.trim(),
            maxItems: Math.min(100, Math.max(1, Number(count) || 20)),
            rule,
          })
        }
      >
        إنشاء القسم الذكي
      </button>
    </div>
  );
}

// Shared by "add a new row" and "replace this row's contents" - the same three TMDB sources.
function ImportForm({
  onSubmit,
  busy,
  submitLabel,
  onListName,
}: {
  onSubmit: (spec: HomeSectionImportSpec) => void;
  busy: boolean;
  submitLabel: string;
  // Called with the TMDB list's own name once a pasted link resolves, so a new row can be named after it.
  onListName?: (name: string) => void;
}) {
  const [source, setSource] = useState<ImportSource>('preset');
  const [preset, setPreset] = useState('top-rated-movies');
  const [listId, setListId] = useState('');
  const [kind, setKind] = useState<'movie' | 'tv'>('movie');
  const [year, setYear] = useState('');
  const [language, setLanguage] = useState('');
  const [genres, setGenres] = useState('');
  const [keywords, setKeywords] = useState('');
  const [minVotes, setMinVotes] = useState('');
  const [minRating, setMinRating] = useState('');
  const [limit, setLimit] = useState('50');
  const [imdbText, setImdbText] = useState('');
  const imdbIds = extractImdbIds(imdbText);
  const [preview, setPreview] = useState<HomeSectionListPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Paste a TMDB list link (or its number) and everything inside it shows up right away - each item
  // marked as already in the catalog or about to be imported - before anything is imported.
  useEffect(() => {
    if (source !== 'list' || !/\d/.test(listId)) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    const timer = setTimeout(() => {
      adminService
        .previewTmdbList(listId)
        .then((result) => {
          if (cancelled) return;
          setPreview(result);
          setLimit(String(Math.min(500, result.total || result.items.length)));
          if (result.name) onListName?.(result.name);
        })
        .catch((err) => {
          if (cancelled) return;
          setPreview(null);
          setPreviewError(err instanceof Error ? err.message : 'تعذّر جلب القائمة من TMDB.');
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, listId]);

  function submit() {
    const spec: HomeSectionImportSpec = {
      source,
      limit: Math.min(500, Math.max(1, Number(limit) || 50)),
      importMissing: true,
    };
    if (source === 'preset') spec.preset = preset;
    if (source === 'list') spec.listId = listId;
    if (source === 'imdb') {
      spec.imdbIds = imdbIds.slice(0, 500);
      spec.limit = spec.imdbIds.length;
    }
    if (source === 'discover') {
      spec.kind = kind;
      if (year) spec.year = Number(year);
      if (language) spec.language = language;
      if (genres) spec.genres = genres;
      if (keywords) spec.keywords = keywords;
      if (minVotes) spec.minVotes = Number(minVotes);
      if (minRating) spec.minRating = Number(minRating);
    }
    onSubmit(spec);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as ImportSource)}
          className={inputCls}
        >
          <option value="preset">قائمة جاهزة من TMDB</option>
          <option value="list">قائمة TMDB برقمها أو رابطها</option>
          <option value="discover">استعلام مخصص (سنة / لغة / تصنيف)</option>
          <option value="imdb">قائمة IMDb (ملف CSV أو أرقام tt)</option>
        </select>
        {source !== 'imdb' && (
          <label className="text-xs text-zinc-400 flex items-center gap-2">
            عدد العناصر
            <input
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className={`${inputCls} w-20`}
              dir="ltr"
            />
          </label>
        )}
      </div>

      {source === 'imdb' && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            موقع IMDb يمنع الخوادم من قراءة صفحاته، لذلك تُستورد القائمة من ملفها: افتح القائمة في
            المتصفح ← اضغط ⋯ ← Export ← يُنزَّل ملف CSV، ثم اختره هنا (أو الصق محتواه / أرقام tt
            يدوياً). يُحافَظ على ترتيب القائمة.
          </p>
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="text-xs text-zinc-400"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setImdbText(await file.text());
            }}
          />
          <textarea
            value={imdbText}
            onChange={(e) => setImdbText(e.target.value)}
            placeholder="tt0111161, tt0068646, ..."
            rows={4}
            className={`${inputCls} w-full font-mono`}
            dir="ltr"
          />
          <p className="text-[11px] text-zinc-400">
            {imdbIds.length === 0
              ? 'لم يُعثر على أي رقم tt بعد.'
              : `تم العثور على ${imdbIds.length} عمل${imdbIds.length > 500 ? ' (سيُستورد أول 500)' : ''}.`}
          </p>
        </div>
      )}

      {source === 'preset' && (
        <select value={preset} onChange={(e) => setPreset(e.target.value)} className={inputCls}>
          {Object.entries(PRESET_LABEL).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      )}

      {source === 'list' && (
        <div>
          <input
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            placeholder="https://www.themoviedb.org/list/634  أو  634"
            className={`${inputCls} w-full`}
            dir="ltr"
          />
          <p className="text-[11px] text-zinc-500 mt-1">
            أي قائمة عامة على موقع TMDB (مثل قوائم جوائز الإيمي أو الأوسكار التي ينشئها المستخدمون).
            افتح القائمة على الموقع وانسخ رابطها هنا.
          </p>
          {previewLoading && (
            <p className="text-[11px] text-zinc-500 mt-2 flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" /> جارٍ جلب القائمة...
            </p>
          )}
          {previewError && <p className="text-[11px] text-red-400 mt-2">{previewError}</p>}
          {preview && (
            <div className="mt-3 border border-zinc-800 rounded-xl p-3">
              <p className="text-xs font-bold">
                {preview.name || 'قائمة بدون اسم'}{' '}
                <span className="text-zinc-500 font-normal">· {preview.total} عمل</span>
              </p>
              {preview.description && (
                <p className="text-[11px] text-zinc-500 mt-1 line-clamp-2">{preview.description}</p>
              )}
              <p className="text-[11px] text-zinc-500 mt-1">
                {preview.items.filter((i) => i.inCatalog).length} موجود في الكتالوج ·{' '}
                {preview.items.filter((i) => !i.inCatalog).length} سيُستورد
                {preview.total > preview.items.length && ` (المعروض أول ${preview.items.length})`}
              </p>
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 mt-3 max-h-72 overflow-y-auto">
                {preview.items.map((item) => (
                  <div
                    key={`${item.mediaType}-${item.tmdbId}`}
                    className="text-[10px]"
                    title={item.title}
                  >
                    <div className="relative aspect-[2/3] bg-zinc-900 rounded-md overflow-hidden">
                      { }
                      {item.poster && (
                        <img src={item.poster} alt="" className="w-full h-full object-cover" />
                      )}
                      <span
                        className={`absolute bottom-0 inset-x-0 text-center py-0.5 font-bold ${
                          item.inCatalog ? 'bg-emerald-600/80' : 'bg-amber-600/80'
                        }`}
                      >
                        {item.inCatalog ? 'موجود' : 'جديد'}
                      </span>
                    </div>
                    <p className="truncate mt-1 text-zinc-400">
                      {item.title} {item.year ? `(${item.year})` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {source === 'discover' && (
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as 'movie' | 'tv')}
            className={inputCls}
          >
            <option value="movie">أفلام</option>
            <option value="tv">مسلسلات</option>
          </select>
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="السنة 2024"
            className={`${inputCls} w-28`}
            dir="ltr"
          />
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="لغة: ar / tr / en"
            className={`${inputCls} w-32`}
            dir="ltr"
          />
          <input
            value={genres}
            onChange={(e) => setGenres(e.target.value)}
            placeholder="أرقام تصنيفات: 18,35"
            className={`${inputCls} w-40`}
            dir="ltr"
          />
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="أرقام كلمات مفتاحية"
            className={`${inputCls} w-40`}
            dir="ltr"
          />
          <input
            value={minVotes}
            onChange={(e) => setMinVotes(e.target.value)}
            placeholder="أقل عدد أصوات"
            className={`${inputCls} w-32`}
            dir="ltr"
          />
          <input
            value={minRating}
            onChange={(e) => setMinRating(e.target.value)}
            placeholder="أقل تقييم 7.5"
            className={`${inputCls} w-32`}
            dir="ltr"
          />
        </div>
      )}

      <button
        className={`${btnCls} bg-white text-black`}
        disabled={busy || (source === 'imdb' && imdbIds.length === 0)}
        onClick={submit}
      >
        {busy ? <Loader2 size={12} className="animate-spin inline" /> : submitLabel}
      </button>
    </div>
  );
}

function SectionItems({ section, onChanged }: { section: HomeSectionDto; onChanged: () => void }) {
  const [items, setItems] = useState<HomeSectionItemDto[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'movie' | 'show'>('movie');
  const [results, setResults] = useState<
    Array<(AdminMovieSummaryDto | AdminShowSummaryDto) & { kindTag: 'movie' | 'show' }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    adminService
      .homeSectionItems(section.id)
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذّر التحميل.'));
  }
  useEffect(load, [section.id, section.itemCount]);

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!search.trim()) return;
    try {
      if (type === 'movie') {
        const r = await adminService.listMovies({
          search: search.trim(),
          limit: 8,
          status: 'PUBLISHED',
        });
        setResults(r.items.map((m) => ({ ...m, kindTag: 'movie' as const })));
      } else {
        const r = await adminService.listShows({
          search: search.trim(),
          limit: 8,
          status: 'PUBLISHED',
        });
        setResults(r.items.map((s) => ({ ...s, kindTag: 'show' as const })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل البحث.');
    }
  }

  async function add(result: (typeof results)[number]) {
    try {
      await adminService.addHomeSectionItem(
        section.id,
        result.kindTag === 'movie' ? { movieId: result.id } : { showId: result.id },
      );
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت الإضافة.');
    }
  }

  async function remove(itemId: string) {
    await adminService.removeHomeSectionItem(section.id, itemId);
    load();
    onChanged();
  }

  return (
    <div className="mt-3 border-t border-zinc-800 pt-3">
      <form onSubmit={runSearch} className="flex gap-2 mb-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as 'movie' | 'show')}
          className={inputCls}
        >
          <option value="movie">فيلم</option>
          <option value="show">مسلسل</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث في الكتالوج لإضافة عمل"
          className={`${inputCls} flex-1`}
        />
        <button className={btnCls} type="submit">
          <Search size={12} />
        </button>
      </form>
      {results.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => void add(r)}
              className="px-2 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 text-[11px]"
            >
              <Plus size={10} className="inline me-1" />
              {r.titleAr || r.title}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      <div className="grid gap-1 max-h-72 overflow-y-auto">
        {items.map((item, index) => (
          <div
            key={item.itemId}
            className="flex items-center gap-2 text-xs bg-zinc-900/60 rounded-md px-2 py-1"
          >
            <span className="text-zinc-600 w-6">{index + 1}</span>
            <span className="flex-1 truncate">
              {item.title} {item.year ? `(${item.year})` : ''}{' '}
              {item.rating != null && `· ★ ${item.rating.toFixed(1)}`}
              {item.status && item.status !== 'PUBLISHED' && (
                <span className="text-amber-400 ms-2">لن يظهر: {item.status}</span>
              )}
            </span>
            <span className="text-zinc-500">{item.type === 'movie' ? 'فيلم' : 'مسلسل'}</span>
            <button
              onClick={() => void remove(item.itemId)}
              className="text-zinc-500 hover:text-red-400"
            >
              <X size={13} />
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-zinc-500">لا توجد عناصر بعد.</p>}
      </div>
    </div>
  );
}

export default function HomeSectionsPage() {
  const { isLoading, user } = useAuth();
  const [sections, setSections] = useState<HomeSectionDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [importFor, setImportFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newTitleAr, setNewTitleAr] = useState('');
  const [newTitleEn, setNewTitleEn] = useState('');
  const [newFill, setNewFill] = useState<'empty' | 'tmdb'>('tmdb');

  function load() {
    adminService
      .homeSections()
      .then(setSections)
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذّر تحميل الأقسام.'));
  }
  useEffect(() => {
    if (user) load();
  }, [user]);

  const importing = sections.some((s) => s.importStatus === 'IMPORTING');
  useEffect(() => {
    if (!importing) return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [importing]);

  async function guarded(action: () => Promise<void>, okMessage?: string) {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await action();
      if (okMessage) setMessage(okMessage);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت العملية.');
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, delta: number) {
    const next = [...sections];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setSections(next);
    void guarded(() => adminService.reorderHomeSections(next.map((s) => s.id)));
  }

  function createBuiltin(kind: Exclude<HomeSectionKind, 'CUSTOM' | 'RULE'>) {
    const d = BUILTIN_DEFAULTS[kind];
    void guarded(async () => {
      await adminService.createHomeSection({ kind, titleAr: d.ar, titleEn: d.en });
    }, 'تمت إضافة القسم.');
  }

  function createCustom(spec?: HomeSectionImportSpec) {
    if (!newTitleAr.trim() || !newTitleEn.trim()) {
      setError('اكتب اسم القسم بالعربية والإنجليزية.');
      return;
    }
    void guarded(
      async () => {
        const section = await adminService.createHomeSection({
          kind: 'CUSTOM',
          titleAr: newTitleAr.trim(),
          titleEn: newTitleEn.trim(),
        });
        if (spec) await adminService.importHomeSection(section.id, spec);
        setNewTitleAr('');
        setNewTitleEn('');
      },
      spec
        ? 'تم إنشاء القسم وبدأ الاستيراد في الخلفية.'
        : 'تم إنشاء القسم الفارغ - افتح "العناصر" لإضافة أعمال.',
    );
  }

  if (isLoading || !user) return null;

  return (
    <AdminLayout>
      <div className="max-w-4xl">
        <h1 className="text-xl font-black mb-1">أقسام الشاشة الرئيسية</h1>
        <p className="text-xs text-zinc-500 mb-6">
          رتّب الصفوف الظاهرة في التطبيق، أخفِ أو احذف أي صف (بما فيها الأحدث والأكثر شعبية والأعلى
          تقييماً)، وأضف صفوفاً جديدة من قوائم TMDB الجاهزة أو اختر أعمالها يدوياً.
        </p>

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        {message && <p className="text-xs text-emerald-400 mb-3">{message}</p>}

        <section className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-5 mb-6 space-y-3">
          <h2 className="text-sm font-black">إضافة قسم</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-400">قسم تلقائي:</span>
            {(
              Object.keys(BUILTIN_DEFAULTS) as Array<Exclude<HomeSectionKind, 'CUSTOM' | 'RULE'>>
            ).map((kind) => (
              <button
                key={kind}
                className={btnCls}
                disabled={busy}
                onClick={() => createBuiltin(kind)}
              >
                + {BUILTIN_DEFAULTS[kind].ar}
              </button>
            ))}
          </div>
          <div className="border-t border-zinc-800 pt-3 space-y-3">
            <span className="text-xs text-zinc-400">
              قسم ذكي حسب اللغة والنوع (يُحدَّث تلقائياً من كتالوجك):
            </span>
            <SmartSectionForm
              busy={busy}
              onCreate={(input) =>
                void guarded(async () => {
                  await adminService.createHomeSection({ kind: 'RULE', ...input });
                }, 'تم إنشاء القسم الذكي.')
              }
            />
          </div>
          <div className="border-t border-zinc-800 pt-3 space-y-3">
            <span className="text-xs text-zinc-400">قسم مخصص:</span>
            <div className="flex flex-wrap gap-2">
              <input
                value={newTitleAr}
                onChange={(e) => setNewTitleAr(e.target.value)}
                placeholder="الاسم بالعربية"
                className={`${inputCls} w-56`}
              />
              <input
                value={newTitleEn}
                onChange={(e) => setNewTitleEn(e.target.value)}
                placeholder="Name in English"
                className={`${inputCls} w-56`}
                dir="ltr"
              />
              <select
                value={newFill}
                onChange={(e) => setNewFill(e.target.value as 'empty' | 'tmdb')}
                className={inputCls}
              >
                <option value="tmdb">تعبئته من TMDB</option>
                <option value="empty">فارغ (أختار الأعمال يدوياً)</option>
              </select>
            </div>
            {newFill === 'tmdb' ? (
              <ImportForm
                busy={busy}
                submitLabel="إنشاء القسم واستيراد القائمة"
                onSubmit={(spec) => createCustom(spec)}
                onListName={(name) => setNewTitleEn((current) => current || name)}
              />
            ) : (
              <button
                className={`${btnCls} bg-white text-black`}
                disabled={busy}
                onClick={() => createCustom()}
              >
                إنشاء قسم فارغ
              </button>
            )}
          </div>
        </section>

        <div className="space-y-3">
          {sections.map((section, index) => (
            <div
              key={section.id}
              className={`bg-[#0a0a0a] border rounded-2xl p-4 ${section.isVisible ? 'border-zinc-800' : 'border-zinc-900 opacity-60'}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-col">
                  <button
                    disabled={index === 0 || busy}
                    onClick={() => move(index, -1)}
                    className="text-zinc-500 hover:text-white disabled:opacity-20"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    disabled={index === sections.length - 1 || busy}
                    onClick={() => move(index, 1)}
                    className="text-zinc-500 hover:text-white disabled:opacity-20"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
                <input
                  defaultValue={section.titleAr}
                  onBlur={(e) =>
                    e.target.value !== section.titleAr &&
                    void guarded(() =>
                      adminService.updateHomeSection(section.id, { titleAr: e.target.value }),
                    )
                  }
                  className={`${inputCls} w-48`}
                />
                <input
                  defaultValue={section.titleEn}
                  onBlur={(e) =>
                    e.target.value !== section.titleEn &&
                    void guarded(() =>
                      adminService.updateHomeSection(section.id, { titleEn: e.target.value }),
                    )
                  }
                  className={`${inputCls} w-48`}
                  dir="ltr"
                />
                <span className="px-2 py-1 rounded-md bg-zinc-900 text-[11px] text-zinc-400">
                  {KIND_LABEL[section.kind]}
                </span>
                {section.kind === 'CUSTOM' && (
                  <span className="text-[11px] text-zinc-400">{section.itemCount} عنصر</span>
                )}
                {section.kind === 'RULE' && section.rule && (
                  <span className="text-[11px] text-zinc-400">
                    {MEDIA_LABEL[section.rule.media].ar} ·{' '}
                    {section.rule.language
                      ? (LANGUAGE_AR[section.rule.language] ?? section.rule.language)
                      : 'كل اللغات'}{' '}
                    · {SORT_LABEL[section.rule.sort]}
                    {section.rule.genre ? ` · ${section.rule.genre}` : ''}
                  </span>
                )}
                <div className="flex-1" />
                <button
                  className={btnCls}
                  title={section.isVisible ? 'إخفاء من التطبيق' : 'إظهار في التطبيق'}
                  onClick={() =>
                    void guarded(() =>
                      adminService.updateHomeSection(section.id, { isVisible: !section.isVisible }),
                    )
                  }
                >
                  {section.isVisible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                {section.kind === 'CUSTOM' && (
                  <>
                    <button
                      className={btnCls}
                      onClick={() => setImportFor(importFor === section.id ? null : section.id)}
                    >
                      استبدال بقائمة TMDB
                    </button>
                    <button
                      className={btnCls}
                      onClick={() => setExpanded(expanded === section.id ? null : section.id)}
                    >
                      العناصر{' '}
                      {expanded === section.id ? (
                        <ChevronUp size={12} className="inline" />
                      ) : (
                        <ChevronDown size={12} className="inline" />
                      )}
                    </button>
                  </>
                )}
                <button
                  className={`${btnCls} text-red-400`}
                  onClick={() =>
                    confirm(`حذف القسم "${section.titleAr}" من الشاشة الرئيسية؟`) &&
                    void guarded(() => adminService.deleteHomeSection(section.id))
                  }
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {section.importStatus && (
                <div className="mt-3 text-xs">
                  <div className="flex items-center gap-2 text-zinc-400">
                    {section.importStatus === 'IMPORTING' && (
                      <Loader2 size={12} className="animate-spin" />
                    )}
                    <span>
                      {section.importSource} ·{' '}
                      {section.importStatus === 'IMPORTING' &&
                        `جارٍ الاستيراد ${section.importDone}/${section.importTotal || '...'}`}
                      {section.importStatus === 'DONE' && `اكتمل (${section.itemCount} عنصر)`}
                      {section.importStatus === 'FAILED' && (
                        <span className="text-red-400">فشل: {section.importError}</span>
                      )}
                    </span>
                  </div>
                  {section.importStatus === 'IMPORTING' && section.importTotal > 0 && (
                    <div className="h-1 bg-zinc-800 rounded mt-1">
                      <div
                        className="h-1 bg-emerald-500 rounded"
                        style={{
                          width: `${Math.round((section.importDone / section.importTotal) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {importFor === section.id && (
                <div className="mt-3 border-t border-zinc-800 pt-3">
                  <p className="text-[11px] text-amber-400 mb-2">
                    سيُستبدل محتوى القسم الحالي بالكامل بنتيجة القائمة الجديدة، وتُستورد الأعمال غير
                    الموجودة في الكتالوج.
                  </p>
                  <ImportForm
                    busy={busy}
                    submitLabel="ابدأ الاستيراد"
                    onSubmit={(spec) => {
                      setImportFor(null);
                      void guarded(
                        () => adminService.importHomeSection(section.id, spec),
                        'بدأ الاستيراد في الخلفية.',
                      );
                    }}
                  />
                </div>
              )}

              {expanded === section.id && section.kind === 'CUSTOM' && (
                <SectionItems section={section} onChanged={load} />
              )}
            </div>
          ))}
          {sections.length === 0 && (
            <p className="text-xs text-zinc-500">
              لا توجد أقسام محفوظة، لذلك يعرض التطبيق الأقسام الأربعة الافتراضية. أضف قسماً للبدء
              بالتحكم الكامل.
            </p>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
