// ============================================================================
// i18n.js — Internationalization Support
// Drop into: /var/www/realnow/frontend/src/i18n/i18n.js
// ============================================================================
//
// Lightweight i18n system with React context. No external dependencies.
// Supports: English, Spanish, French, Portuguese, Arabic, Chinese, Hindi.
//
// Usage in App.js:
//   import { I18nProvider, useTranslation, LANGUAGES } from './i18n/i18n';
//
//   Wrap your app:
//   <I18nProvider language={language}>
//     <App />
//   </I18nProvider>
//
//   In components:
//   const { t, lang } = useTranslation();
//   <span>{t('loading')}</span>
// ============================================================================

import React, { createContext, useContext, useMemo, useCallback } from 'react';

// ── Available Languages ────────────────────────────────────────────────────

export const LANGUAGES = {
  en: { label: 'English', flag: '🇬🇧', dir: 'ltr' },
  es: { label: 'Español', flag: '🇪🇸', dir: 'ltr' },
  fr: { label: 'Français', flag: '🇫🇷', dir: 'ltr' },
  pt: { label: 'Português', flag: '🇧🇷', dir: 'ltr' },
  ar: { label: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  zh: { label: '中文', flag: '🇨🇳', dir: 'ltr' },
  hi: { label: 'हिन्दी', flag: '🇮🇳', dir: 'ltr' },
};

// ── Translation Strings ────────────────────────────────────────────────────

const TRANSLATIONS = {
  en: {
    // General
    loading: 'Loading Real-Time Disaster Data...',
    connected: 'Connected',
    disconnected: 'Disconnected',
    live: 'LIVE',
    offline: 'OFFLINE',
    close: 'Close',
    back: 'Back',
    search: 'Search',
    share: 'Share',
    settings: 'Settings',
    analytics: 'Analytics',
    
    // Disaster types
    earthquakes: 'Earthquakes',
    wildfires: 'Wildfires',
    floods: 'Floods',
    cyclones: 'Cyclones',
    volcanoes: 'Volcanoes',
    droughts: 'Droughts',
    landslides: 'Landslides',
    tsunamis: 'Tsunamis',
    spaceweather: 'Space Weather',
    fires: 'Fire Hotspots',
    weather: 'Weather Alerts',
    
    // Severity
    critical: 'CRITICAL',
    severe: 'SEVERE',
    moderate: 'MODERATE',
    minor: 'MINOR',
    active: 'ACTIVE',
    ended: 'ENDED',
    contained: 'CONTAINED',
    activelyBurning: 'ACTIVELY BURNING',
    justContained: 'JUST CONTAINED',
    
    // Stats
    totalEvents: 'Total Events',
    activeEvents: 'Active Events',
    endedEvents: 'Ended Events',
    mostAffected: 'Most Affected Regions',
    severityDist: 'Severity Distribution',
    sourceHealth: 'Data Source Health',
    
    // LiveFeed
    liveFeed: 'Live Feed',
    newEvents: 'new events',
    noEvents: 'Waiting for events...',
    
    // Map
    zoomIn: 'Zoom in for details',
    searchLocation: 'Search location...',
    watchArea: 'Watch Area',
    setWatchArea: 'Set Watch Area',
    clearWatchArea: 'Clear Watch Area',
    
    // Alerts
    alerts: 'Alerts',
    enableAlerts: 'Enable Alerts',
    disableAlerts: 'Disable Alerts',
    nearby: 'NEARBY',
    kmAway: 'km away',
    
    // Detail drawer
    viewDetails: 'View Full Details',
    magnitude: 'Magnitude',
    depth: 'Depth',
    windSpeed: 'Wind Speed',
    alertLevel: 'Alert Level',
    affectedArea: 'Affected Area',
    started: 'Started',
    country: 'Country',
    sources: 'Sources',
    coordinates: 'Coordinates',
    
    // Preferences
    darkMode: 'Dark',
    satellite: 'Satellite',
    terrain: 'Terrain',
    light: 'Light',
    language: 'Language',
    sound: 'Sound',
    emailDigest: 'Email Digest',
    
    // Time
    justNow: 'just now',
    secondsAgo: '{n}s ago',
    minutesAgo: '{n}m ago',
    hoursAgo: '{n}h ago',
    daysAgo: '{n}d ago',
    day: 'Day',
    
    // Timeline
    timeline: 'Timeline',
    timelinePlay: 'Play Timeline',
    timelinePause: 'Pause',
    allTime: 'All Time',
    last24h: 'Last 24h',
    last7d: 'Last 7 days',
    last30d: 'Last 30 days',
  },

  es: {
    loading: 'Cargando datos de desastres en tiempo real...',
    connected: 'Conectado',
    disconnected: 'Desconectado',
    live: 'EN VIVO',
    offline: 'SIN CONEXIÓN',
    close: 'Cerrar',
    back: 'Atrás',
    search: 'Buscar',
    share: 'Compartir',
    settings: 'Ajustes',
    analytics: 'Análisis',
    earthquakes: 'Terremotos',
    wildfires: 'Incendios Forestales',
    floods: 'Inundaciones',
    cyclones: 'Ciclones',
    volcanoes: 'Volcanes',
    droughts: 'Sequías',
    landslides: 'Deslizamientos',
    tsunamis: 'Tsunamis',
    spaceweather: 'Clima Espacial',
    fires: 'Puntos de Calor',
    weather: 'Alertas Meteorológicas',
    critical: 'CRÍTICO',
    severe: 'SEVERO',
    moderate: 'MODERADO',
    minor: 'MENOR',
    active: 'ACTIVO',
    ended: 'TERMINADO',
    contained: 'CONTENIDO',
    activelyBurning: 'EN LLAMAS',
    justContained: 'RECIÉN CONTENIDO',
    totalEvents: 'Eventos Totales',
    activeEvents: 'Eventos Activos',
    endedEvents: 'Eventos Terminados',
    mostAffected: 'Regiones Más Afectadas',
    severityDist: 'Distribución de Severidad',
    sourceHealth: 'Estado de Fuentes',
    liveFeed: 'Feed en Vivo',
    newEvents: 'nuevos eventos',
    noEvents: 'Esperando eventos...',
    zoomIn: 'Acercar para ver detalles',
    searchLocation: 'Buscar ubicación...',
    watchArea: 'Zona de Vigilancia',
    setWatchArea: 'Establecer Zona',
    clearWatchArea: 'Limpiar Zona',
    alerts: 'Alertas',
    enableAlerts: 'Activar Alertas',
    disableAlerts: 'Desactivar Alertas',
    nearby: 'CERCANO',
    kmAway: 'km de distancia',
    viewDetails: 'Ver Detalles',
    magnitude: 'Magnitud',
    depth: 'Profundidad',
    windSpeed: 'Velocidad del Viento',
    alertLevel: 'Nivel de Alerta',
    affectedArea: 'Área Afectada',
    started: 'Inicio',
    country: 'País',
    sources: 'Fuentes',
    coordinates: 'Coordenadas',
    darkMode: 'Oscuro',
    satellite: 'Satélite',
    terrain: 'Terreno',
    light: 'Claro',
    language: 'Idioma',
    sound: 'Sonido',
    emailDigest: 'Resumen por Email',
    justNow: 'ahora',
    secondsAgo: 'hace {n}s',
    minutesAgo: 'hace {n}m',
    hoursAgo: 'hace {n}h',
    daysAgo: 'hace {n}d',
    day: 'Día',
    timeline: 'Línea Temporal',
    timelinePlay: 'Reproducir',
    timelinePause: 'Pausar',
    allTime: 'Todo',
    last24h: 'Últimas 24h',
    last7d: 'Últimos 7 días',
    last30d: 'Últimos 30 días',
  },

  fr: {
    loading: 'Chargement des données de catastrophes en temps réel...',
    connected: 'Connecté',
    disconnected: 'Déconnecté',
    live: 'EN DIRECT',
    offline: 'HORS LIGNE',
    close: 'Fermer',
    back: 'Retour',
    search: 'Rechercher',
    share: 'Partager',
    settings: 'Paramètres',
    analytics: 'Analyses',
    earthquakes: 'Séismes',
    wildfires: 'Feux de Forêt',
    floods: 'Inondations',
    cyclones: 'Cyclones',
    volcanoes: 'Volcans',
    droughts: 'Sécheresses',
    landslides: 'Glissements de Terrain',
    tsunamis: 'Tsunamis',
    spaceweather: 'Météo Spatiale',
    fires: 'Points Chauds',
    weather: 'Alertes Météo',
    critical: 'CRITIQUE',
    severe: 'SÉVÈRE',
    moderate: 'MODÉRÉ',
    minor: 'MINEUR',
    active: 'ACTIF',
    ended: 'TERMINÉ',
    contained: 'MAÎTRISÉ',
    activelyBurning: 'EN COURS',
    justContained: 'RÉCEMMENT MAÎTRISÉ',
    totalEvents: 'Événements Totaux',
    activeEvents: 'Événements Actifs',
    endedEvents: 'Événements Terminés',
    mostAffected: 'Régions les Plus Touchées',
    severityDist: 'Distribution de Gravité',
    sourceHealth: 'État des Sources',
    liveFeed: 'Flux en Direct',
    newEvents: 'nouveaux événements',
    noEvents: 'En attente d\'événements...',
    zoomIn: 'Zoomer pour plus de détails',
    searchLocation: 'Rechercher un lieu...',
    watchArea: 'Zone de Surveillance',
    setWatchArea: 'Définir la Zone',
    clearWatchArea: 'Effacer la Zone',
    alerts: 'Alertes',
    enableAlerts: 'Activer les Alertes',
    disableAlerts: 'Désactiver les Alertes',
    nearby: 'PROCHE',
    kmAway: 'km',
    viewDetails: 'Voir les Détails',
    magnitude: 'Magnitude',
    depth: 'Profondeur',
    windSpeed: 'Vitesse du Vent',
    alertLevel: 'Niveau d\'Alerte',
    affectedArea: 'Zone Affectée',
    started: 'Début',
    country: 'Pays',
    sources: 'Sources',
    coordinates: 'Coordonnées',
    darkMode: 'Sombre',
    satellite: 'Satellite',
    terrain: 'Relief',
    light: 'Clair',
    language: 'Langue',
    sound: 'Son',
    emailDigest: 'Résumé par Email',
    justNow: 'à l\'instant',
    secondsAgo: 'il y a {n}s',
    minutesAgo: 'il y a {n}m',
    hoursAgo: 'il y a {n}h',
    daysAgo: 'il y a {n}j',
    day: 'Jour',
    timeline: 'Chronologie',
    timelinePlay: 'Lecture',
    timelinePause: 'Pause',
    allTime: 'Tout',
    last24h: 'Dernières 24h',
    last7d: '7 derniers jours',
    last30d: '30 derniers jours',
  },

  pt: {
    loading: 'Carregando dados de desastres em tempo real...',
    connected: 'Conectado', disconnected: 'Desconectado',
    live: 'AO VIVO', offline: 'OFFLINE', close: 'Fechar', back: 'Voltar',
    search: 'Buscar', share: 'Compartilhar', settings: 'Configurações', analytics: 'Análises',
    earthquakes: 'Terremotos', wildfires: 'Incêndios Florestais', floods: 'Enchentes',
    cyclones: 'Ciclones', volcanoes: 'Vulcões', droughts: 'Secas', landslides: 'Deslizamentos',
    tsunamis: 'Tsunamis', spaceweather: 'Clima Espacial', fires: 'Focos de Calor', weather: 'Alertas Meteorológicos',
    critical: 'CRÍTICO', severe: 'SEVERO', moderate: 'MODERADO', minor: 'MENOR',
    active: 'ATIVO', ended: 'ENCERRADO', contained: 'CONTIDO',
    activelyBurning: 'EM CHAMAS', justContained: 'RECÉM CONTIDO',
    totalEvents: 'Total de Eventos', activeEvents: 'Eventos Ativos', endedEvents: 'Eventos Encerrados',
    mostAffected: 'Regiões Mais Afetadas', severityDist: 'Distribuição de Severidade', sourceHealth: 'Saúde das Fontes',
    liveFeed: 'Feed ao Vivo', newEvents: 'novos eventos', noEvents: 'Aguardando eventos...',
    zoomIn: 'Aproxime para detalhes', searchLocation: 'Buscar local...', watchArea: 'Área de Monitoramento',
    setWatchArea: 'Definir Área', clearWatchArea: 'Limpar Área',
    alerts: 'Alertas', enableAlerts: 'Ativar Alertas', disableAlerts: 'Desativar Alertas',
    nearby: 'PRÓXIMO', kmAway: 'km', viewDetails: 'Ver Detalhes',
    magnitude: 'Magnitude', depth: 'Profundidade', windSpeed: 'Velocidade do Vento',
    alertLevel: 'Nível de Alerta', affectedArea: 'Área Afetada', started: 'Início',
    country: 'País', sources: 'Fontes', coordinates: 'Coordenadas',
    darkMode: 'Escuro', satellite: 'Satélite', terrain: 'Relevo', light: 'Claro',
    language: 'Idioma', sound: 'Som', emailDigest: 'Resumo por Email',
    justNow: 'agora', secondsAgo: 'há {n}s', minutesAgo: 'há {n}m', hoursAgo: 'há {n}h', daysAgo: 'há {n}d',
    day: 'Dia', timeline: 'Linha do Tempo', timelinePlay: 'Reproduzir', timelinePause: 'Pausar',
    allTime: 'Tudo', last24h: 'Últimas 24h', last7d: 'Últimos 7 dias', last30d: 'Últimos 30 dias',
  },

  ar: {
    loading: 'جاري تحميل بيانات الكوارث...',
    connected: 'متصل', disconnected: 'غير متصل',
    live: 'مباشر', offline: 'غير متصل', close: 'إغلاق', back: 'رجوع',
    search: 'بحث', share: 'مشاركة', settings: 'إعدادات', analytics: 'تحليلات',
    earthquakes: 'زلازل', wildfires: 'حرائق الغابات', floods: 'فيضانات',
    cyclones: 'أعاصير', volcanoes: 'براكين', droughts: 'جفاف', landslides: 'انهيارات أرضية',
    tsunamis: 'تسونامي', spaceweather: 'طقس فضائي', fires: 'بؤر حرارية', weather: 'تنبيهات جوية',
    critical: 'حرج', severe: 'شديد', moderate: 'معتدل', minor: 'طفيف',
    active: 'نشط', ended: 'انتهى', contained: 'تم السيطرة',
    activelyBurning: 'يحترق', justContained: 'تم السيطرة مؤخراً',
    totalEvents: 'إجمالي الأحداث', activeEvents: 'أحداث نشطة', endedEvents: 'أحداث منتهية',
    mostAffected: 'أكثر المناطق تأثراً', severityDist: 'توزيع الشدة', sourceHealth: 'حالة المصادر',
    liveFeed: 'البث المباشر', newEvents: 'أحداث جديدة', noEvents: 'في انتظار الأحداث...',
    zoomIn: 'قرّب للتفاصيل', searchLocation: 'بحث عن موقع...', watchArea: 'منطقة المراقبة',
    setWatchArea: 'تعيين المنطقة', clearWatchArea: 'مسح المنطقة',
    alerts: 'تنبيهات', enableAlerts: 'تفعيل التنبيهات', disableAlerts: 'تعطيل التنبيهات',
    nearby: 'قريب', kmAway: 'كم', viewDetails: 'عرض التفاصيل',
    magnitude: 'القوة', depth: 'العمق', windSpeed: 'سرعة الرياح',
    alertLevel: 'مستوى التنبيه', affectedArea: 'المنطقة المتأثرة', started: 'البداية',
    country: 'الدولة', sources: 'المصادر', coordinates: 'الإحداثيات',
    darkMode: 'داكن', satellite: 'قمر صناعي', terrain: 'تضاريس', light: 'فاتح',
    language: 'اللغة', sound: 'الصوت', emailDigest: 'ملخص بالبريد',
    justNow: 'الآن', secondsAgo: 'منذ {n}ث', minutesAgo: 'منذ {n}د', hoursAgo: 'منذ {n}س', daysAgo: 'منذ {n}ي',
    day: 'يوم', timeline: 'الجدول الزمني', timelinePlay: 'تشغيل', timelinePause: 'إيقاف',
    allTime: 'الكل', last24h: 'آخر 24 ساعة', last7d: 'آخر 7 أيام', last30d: 'آخر 30 يوم',
  },

  zh: {
    loading: '正在加载实时灾害数据...',
    connected: '已连接', disconnected: '已断开',
    live: '直播', offline: '离线', close: '关闭', back: '返回',
    search: '搜索', share: '分享', settings: '设置', analytics: '分析',
    earthquakes: '地震', wildfires: '森林火灾', floods: '洪水',
    cyclones: '气旋', volcanoes: '火山', droughts: '干旱', landslides: '滑坡',
    tsunamis: '海啸', spaceweather: '太空天气', fires: '热点', weather: '天气预警',
    critical: '危急', severe: '严重', moderate: '中等', minor: '轻微',
    active: '活跃', ended: '已结束', contained: '已控制',
    activelyBurning: '正在燃烧', justContained: '刚刚控制',
    totalEvents: '事件总数', activeEvents: '活跃事件', endedEvents: '已结束事件',
    mostAffected: '最受影响地区', severityDist: '严重程度分布', sourceHealth: '数据源状态',
    liveFeed: '实时动态', newEvents: '新事件', noEvents: '等待事件...',
    zoomIn: '放大查看详情', searchLocation: '搜索地点...', watchArea: '监控区域',
    setWatchArea: '设置区域', clearWatchArea: '清除区域',
    alerts: '警报', enableAlerts: '启用警报', disableAlerts: '关闭警报',
    nearby: '附近', kmAway: '公里', viewDetails: '查看详情',
    magnitude: '震级', depth: '深度', windSpeed: '风速',
    alertLevel: '警报级别', affectedArea: '受灾面积', started: '开始时间',
    country: '国家', sources: '来源', coordinates: '坐标',
    darkMode: '暗色', satellite: '卫星', terrain: '地形', light: '亮色',
    language: '语言', sound: '声音', emailDigest: '邮件摘要',
    justNow: '刚刚', secondsAgo: '{n}秒前', minutesAgo: '{n}分钟前', hoursAgo: '{n}小时前', daysAgo: '{n}天前',
    day: '天', timeline: '时间线', timelinePlay: '播放', timelinePause: '暂停',
    allTime: '全部', last24h: '最近24小时', last7d: '最近7天', last30d: '最近30天',
  },

  hi: {
    loading: 'वास्तविक समय आपदा डेटा लोड हो रहा है...',
    connected: 'जुड़ा हुआ', disconnected: 'डिस्कनेक्ट',
    live: 'लाइव', offline: 'ऑफलाइन', close: 'बंद करें', back: 'वापस',
    search: 'खोजें', share: 'शेयर', settings: 'सेटिंग्स', analytics: 'विश्लेषण',
    earthquakes: 'भूकंप', wildfires: 'जंगल की आग', floods: 'बाढ़',
    cyclones: 'चक्रवात', volcanoes: 'ज्वालामुखी', droughts: 'सूखा', landslides: 'भूस्खलन',
    tsunamis: 'सुनामी', spaceweather: 'अंतरिक्ष मौसम', fires: 'हॉटस्पॉट', weather: 'मौसम चेतावनी',
    critical: 'गंभीर', severe: 'तीव्र', moderate: 'मध्यम', minor: 'मामूली',
    active: 'सक्रिय', ended: 'समाप्त', contained: 'नियंत्रित',
    activelyBurning: 'जल रहा है', justContained: 'अभी नियंत्रित',
    totalEvents: 'कुल घटनाएं', activeEvents: 'सक्रिय घटनाएं', endedEvents: 'समाप्त घटनाएं',
    mostAffected: 'सबसे प्रभावित क्षेत्र', severityDist: 'गंभीरता वितरण', sourceHealth: 'स्रोत स्वास्थ्य',
    liveFeed: 'लाइव फीड', newEvents: 'नई घटनाएं', noEvents: 'घटनाओं की प्रतीक्षा...',
    viewDetails: 'विवरण देखें', magnitude: 'तीव्रता', depth: 'गहराई',
    nearby: 'पास', kmAway: 'किमी',
    darkMode: 'डार्क', satellite: 'सैटेलाइट', terrain: 'भूभाग', light: 'लाइट',
    language: 'भाषा', sound: 'ध्वनि',
    justNow: 'अभी', secondsAgo: '{n}स पहले', minutesAgo: '{n}मि पहले', hoursAgo: '{n}घं पहले', daysAgo: '{n}दि पहले',
    day: 'दिन',
  }
};

// ── React Context ──────────────────────────────────────────────────────────

const I18nContext = createContext({
  lang: 'en',
  t: (key) => key,
  timeAgo: (ts) => ''
});

export const I18nProvider = ({ language = 'en', children }) => {
  const strings = TRANSLATIONS[language] || TRANSLATIONS.en;
  const fallback = TRANSLATIONS.en;

  const t = useCallback((key, params = {}) => {
    let str = strings[key] || fallback[key] || key;
    Object.entries(params).forEach(([k, v]) => {
      str = str.replace(`{${k}}`, v);
    });
    return str;
  }, [strings, fallback]);

  const timeAgo = useCallback((ts) => {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 0) return t('justNow');
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return t('secondsAgo', { n: sec });
    const min = Math.floor(sec / 60);
    if (min < 60) return t('minutesAgo', { n: min });
    const hr = Math.floor(min / 60);
    if (hr < 24) return t('hoursAgo', { n: hr });
    const d = Math.floor(hr / 24);
    return t('daysAgo', { n: d });
  }, [t]);

  const value = useMemo(() => ({
    lang: language,
    dir: LANGUAGES[language]?.dir || 'ltr',
    t,
    timeAgo
  }), [language, t, timeAgo]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
};

export const useTranslation = () => useContext(I18nContext);

export default I18nProvider;