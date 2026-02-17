// ============================================================================
// i18n.js — v5.2 COMPLETE INTERNATIONALIZATION
// Drop into: /var/www/realnow/frontend/src/i18n/i18n.js
// ============================================================================
// v5.2: Added ALL translation keys for EVERY component in the app.
// All 7 languages fully translated. Context provider unchanged.
// ============================================================================

import React, { createContext, useContext, useMemo, useCallback } from 'react';

export const LANGUAGES = {
  en: { label: 'English', flag: '🇬🇧', dir: 'ltr' },
  es: { label: 'Español', flag: '🇪🇸', dir: 'ltr' },
  fr: { label: 'Français', flag: '🇫🇷', dir: 'ltr' },
  pt: { label: 'Português', flag: '🇧🇷', dir: 'ltr' },
  ar: { label: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  zh: { label: '中文', flag: '🇨🇳', dir: 'ltr' },
  hi: { label: 'हिन्दी', flag: '🇮🇳', dir: 'ltr' },
};

const TRANSLATIONS = {
  en: {
    loading:'Loading Real-Time Disaster Data...',connected:'Connected',disconnected:'Disconnected',live:'LIVE',offline:'OFFLINE',close:'Close',back:'Back',search:'Search',share:'Share',settings:'Settings',analytics:'Analytics',copyLink:'Copy Link',linkCopied:'Link copied!',viewFullDetails:'View Full Details →',streamingLive:'Streaming live',reconnecting:'Reconnecting...',unknown:'Unknown',noData:'No data',reports:'reports',
    earthquakes:'Earthquakes',wildfires:'Wildfires',floods:'Floods',cyclones:'Cyclones',volcanoes:'Volcanoes',droughts:'Droughts',landslides:'Landslides',tsunamis:'Tsunamis',spaceweather:'Space Weather',fires:'Fire Hotspots',weather:'Weather Alerts',
    earthquake:'Earthquake',wildfire:'Wildfire',flood:'Flood',cyclone:'Cyclone',volcano:'Volcano',drought:'Drought',landslide:'Landslide',tsunami:'Tsunami',hotspot:'Hotspot',space:'Space',weatherAlert:'Weather',
    critical:'CRITICAL',severe:'SEVERE',moderate:'MODERATE',minor:'MINOR',active:'ACTIVE',ended:'ENDED',contained:'CONTAINED',activelyBurning:'ACTIVELY BURNING',justContained:'JUST CONTAINED',inactive:'Inactive',extreme:'EXTREME',warning:'WARNING',watch:'WATCH',erupting:'ERUPTING',actual:'Actual',expected:'Expected',likely:'Likely',
    totalEvents:'Total Events',activeEvents:'Active Events',endedEvents:'Ended Events',mostAffected:'Most Affected Regions',severityDist:'Severity Distribution',sourceHealth:'Data Source Health',criticalAlerts:'Critical Alerts',criticalAlert:'Critical Alert',
    liveFeed:'Live Feed',newEvents:'new events',noEvents:'Waiting for events...',autoScroll:'Auto-scroll',
    zoomIn:'Zoom in for details',searchLocation:'Search location...',viewDetails:'View Details',magnitude:'Magnitude',depth:'Depth',nearby:'Nearby',kmAway:'km away',location:'Location',coordinates:'Coordinates',source:'Source',time:'Time',event:'Event',country:'Country',areas:'Areas',population:'Population',popAtRisk:'Pop. at Risk',affectedArea:'Affected Area',
    seismicData:'Seismic Data',feltReports:'Felt Reports',alertLevel:'Alert Level',tsunamiWarning:'TSUNAMI WARNING ISSUED',tsunamiWarningShort:'TSUNAMI WARNING',shaking:'Shaking',magType:'Type',depthClass:'Depth Class',
    stormData:'Storm Data',stormType:'Type',category:'Category',windSpeed:'Wind Speed',pressure:'Pressure',track:'Track',movement:'Movement',windRadius:'Wind Radius',basin:'Basin',season:'Season',
    fireStatus:'Fire Status',alert:'Alert',
    floodData:'Flood Data',floodActive:'ACTIVE FLOODING',floodEnded:'Flooding Ended',severity:'Severity',duration:'Duration',affected:'Affected',fromDate:'From',toDate:'To',countries:'Countries',description:'Description',
    droughtData:'Drought Data',droughtLevel:'Level',
    volcanoData:'Volcano Data',alertColor:'Alert Color',lastEruption:'Last Eruption',elevation:'Elevation',type:'Type',
    landslideData:'Landslide Data',fatalities:'Fatalities',trigger:'Trigger',
    alertDetails:'Alert Details',areaTiming:'Area & Timing',headline:'Headline',certainty:'Certainty',response:'Response',status:'Status',onset:'Onset',expires:'Expires',timeLeft:'Time Left',timeRemaining:'{time} remaining',issuedBy:'Issued By',instruction:'Instructions',wind:'Wind',hail:'Hail',tornado:'Tornado',flashFlood:'Flash Flood',thunderstorm:'Thunderstorm',
    spaceWeatherData:'Space Weather Data',tsunamiData:'Tsunami Data',
    locationCoords:'Location',sources:'Sources',timeline:'Timeline',impact:'Impact',details:'Details',parameters:'Parameters',
    mapStyleTitle:'Map Style',darkMode:'Dark',satellite:'Satellite',terrain:'Terrain',light:'Light',language:'Language',sound:'Sound',alertsTitle:'Alerts & Notifications',browserNotifications:'Browser Notifications',alertSounds:'Alert Sounds',watchArea:'Watch Area',clearWatchArea:'Clear Watch Area',noWatchArea:'No watch area set. Click the map with the watch tool.',emailDigest:'Email Digest',emailDigestDesc:'Receive a summary of events in your watch area.',saveEmail:'Save Email',frequency:'Frequency',off:'Off',daily:'Daily',weekly:'Weekly',about:'About',
    disasterMonitor:'DISASTER MONITOR',layers:'LAYERS',controls:'CONTROLS',heatmap:'Heatmap',alerts:'Alerts',clearWatch:'Clear Watch',actions:'ACTIONS',
    overview:'Overview',severityTab:'Severity',sourcesTab:'Sources',eventsByType:'Events by Type',severityBar:'Severity Bar',severityDistribution:'Severity Distribution',mostAffectedRegions:'Most Affected Regions',dataSourceHealth:'Data Source Health',lastFetchTimes:'Last Fetch Times',noCountryData:'No country data available yet.',loadingServerStats:'Loading server stats...',events:'EVENTS',count:'Count',updated:'Updated',never:'Never',ok:'OK',noDataLabel:'NO DATA',
    justNow:'just now',secondsAgo:'{n}s ago',minutesAgo:'{n}m ago',hoursAgo:'{n}h ago',daysAgo:'{n}d ago',day:'day',impactAssessment:'Impact Assessment',stormClassification:'Storm Classification',windAndPressure:'Wind & Pressure',movementDuration:'Movement & Duration',extentImpact:'Extent & Impact',locationImpact:'Location & Impact',externalLinks:'External Links',thermalDetection:'Thermal Detection', pagerAlert:'PAGER Alert',maxShaking:'Max Shaking (MMI)',communityIntensity:'Community Intensity',significance:'Significance',azimuthalGap:'Azimuthal Gap',rmsResidual:'RMS Residual',stationsUsed:'Stations Used',network:'Network', beaufortScale:'Beaufort Scale',maxWindRadius:'Max Wind Radius',heading:'Heading',affectedCountries:'Affected Countries',started:'Started',activeFor:'Active For',lastUpdate:'Last Update',alertScore:'Alert Score', firstObserved:'First Observed',lastObserved:'Last Observed',observations:'Observations',closed:'Closed',brightness:'Brightness',confidence:'Confidence',estimatedArea:'Est. Pixel Area',region:'Region',

  },
  es: {
    loading:'Cargando datos de desastres en tiempo real...',connected:'Conectado',disconnected:'Desconectado',live:'EN VIVO',offline:'SIN CONEXIÓN',close:'Cerrar',back:'Volver',search:'Buscar',share:'Compartir',settings:'Configuración',analytics:'Analíticas',copyLink:'Copiar Enlace',linkCopied:'¡Enlace copiado!',viewFullDetails:'Ver Detalles Completos →',streamingLive:'Transmitiendo en vivo',reconnecting:'Reconectando...',unknown:'Desconocido',noData:'Sin datos',reports:'reportes',
    earthquakes:'Terremotos',wildfires:'Incendios',floods:'Inundaciones',cyclones:'Ciclones',volcanoes:'Volcanes',droughts:'Sequías',landslides:'Deslizamientos',tsunamis:'Tsunamis',spaceweather:'Clima Espacial',fires:'Puntos de Calor',weather:'Alertas Climáticas',
    earthquake:'Terremoto',wildfire:'Incendio',flood:'Inundación',cyclone:'Ciclón',volcano:'Volcán',drought:'Sequía',landslide:'Deslizamiento',tsunami:'Tsunami',hotspot:'Punto de Calor',space:'Espacial',weatherAlert:'Clima',
    critical:'CRÍTICO',severe:'SEVERO',moderate:'MODERADO',minor:'MENOR',active:'ACTIVO',ended:'FINALIZADO',contained:'CONTENIDO',activelyBurning:'EN LLAMAS',justContained:'RECIÉN CONTENIDO',inactive:'Inactivo',extreme:'EXTREMO',warning:'ADVERTENCIA',watch:'VIGILANCIA',erupting:'EN ERUPCIÓN',actual:'Actual',expected:'Esperado',likely:'Probable',
    totalEvents:'Eventos Totales',activeEvents:'Eventos Activos',endedEvents:'Eventos Finalizados',mostAffected:'Regiones Más Afectadas',severityDist:'Distribución de Severidad',sourceHealth:'Salud de Fuentes',criticalAlerts:'Alertas Críticas',criticalAlert:'Alerta Crítica',
    liveFeed:'Feed en Vivo',newEvents:'nuevos eventos',noEvents:'Esperando eventos...',autoScroll:'Auto-desplazar',
    zoomIn:'Acerca para ver detalles',searchLocation:'Buscar ubicación...',viewDetails:'Ver Detalles',magnitude:'Magnitud',depth:'Profundidad',nearby:'Cercano',kmAway:'km',location:'Ubicación',coordinates:'Coordenadas',source:'Fuente',time:'Hora',event:'Evento',country:'País',areas:'Áreas',population:'Población',popAtRisk:'Pob. en Riesgo',affectedArea:'Área Afectada',
    seismicData:'Datos Sísmicos',feltReports:'Reportes Sentidos',alertLevel:'Nivel de Alerta',tsunamiWarning:'ALERTA DE TSUNAMI EMITIDA',tsunamiWarningShort:'ALERTA DE TSUNAMI',shaking:'Sacudida',magType:'Tipo',depthClass:'Clase de Profundidad',
    stormData:'Datos de Tormenta',stormType:'Tipo',category:'Categoría',windSpeed:'Velocidad del Viento',pressure:'Presión',track:'Trayectoria',movement:'Movimiento',windRadius:'Radio de Viento',basin:'Cuenca',season:'Temporada',
    fireStatus:'Estado del Incendio',alert:'Alerta',
    floodData:'Datos de Inundación',floodActive:'INUNDACIÓN ACTIVA',floodEnded:'Inundación Finalizada',severity:'Severidad',duration:'Duración',affected:'Afectados',fromDate:'Desde',toDate:'Hasta',countries:'Países',description:'Descripción',
    droughtData:'Datos de Sequía',droughtLevel:'Nivel',
    volcanoData:'Datos del Volcán',alertColor:'Color de Alerta',lastEruption:'Última Erupción',elevation:'Elevación',type:'Tipo',
    landslideData:'Datos de Deslizamiento',fatalities:'Fatalidades',trigger:'Causa',
    alertDetails:'Detalles de Alerta',areaTiming:'Área y Horario',headline:'Titular',certainty:'Certeza',response:'Respuesta',status:'Estado',onset:'Inicio',expires:'Expira',timeLeft:'Tiempo Restante',timeRemaining:'{time} restante',issuedBy:'Emitido Por',instruction:'Instrucciones',wind:'Viento',hail:'Granizo',tornado:'Tornado',flashFlood:'Inundación Repentina',thunderstorm:'Tormenta',
    spaceWeatherData:'Datos de Clima Espacial',tsunamiData:'Datos de Tsunami',
    locationCoords:'Ubicación',sources:'Fuentes',timeline:'Línea de Tiempo',impact:'Impacto',details:'Detalles',parameters:'Parámetros',
    mapStyleTitle:'Estilo del Mapa',darkMode:'Oscuro',satellite:'Satélite',terrain:'Terreno',light:'Claro',language:'Idioma',sound:'Sonido',alertsTitle:'Alertas y Notificaciones',browserNotifications:'Notificaciones del Navegador',alertSounds:'Sonidos de Alerta',watchArea:'Zona de Vigilancia',clearWatchArea:'Limpiar Zona de Vigilancia',noWatchArea:'Sin zona de vigilancia. Haz clic en el mapa con la herramienta de vigilancia.',emailDigest:'Resumen por Email',emailDigestDesc:'Recibe un resumen de eventos en tu zona de vigilancia.',saveEmail:'Guardar Email',frequency:'Frecuencia',off:'Apagado',daily:'Diario',weekly:'Semanal',about:'Acerca de',
    disasterMonitor:'MONITOR DE DESASTRES',layers:'CAPAS',controls:'CONTROLES',heatmap:'Mapa de Calor',alerts:'Alertas',clearWatch:'Limpiar Vigilancia',actions:'ACCIONES',
    overview:'Resumen',severityTab:'Severidad',sourcesTab:'Fuentes',eventsByType:'Eventos por Tipo',severityBar:'Barra de Severidad',severityDistribution:'Distribución de Severidad',mostAffectedRegions:'Regiones Más Afectadas',dataSourceHealth:'Salud de Fuentes de Datos',lastFetchTimes:'Últimas Actualizaciones',noCountryData:'Sin datos de países disponibles.',loadingServerStats:'Cargando estadísticas...',events:'EVENTOS',count:'Cantidad',updated:'Actualizado',never:'Nunca',ok:'OK',noDataLabel:'SIN DATOS',
    justNow:'ahora',secondsAgo:'hace {n}s',minutesAgo:'hace {n}m',hoursAgo:'hace {n}h',daysAgo:'hace {n}d',day:'día',
    impactAssessment:'Evaluación de Impacto',stormClassification:'Clasificación de Tormenta',windAndPressure:'Viento y Presión',movementDuration:'Movimiento y Duración',extentImpact:'Extensión e Impacto',locationImpact:'Ubicación e Impacto',externalLinks:'Enlaces Externos',thermalDetection:'Detección Térmica',
    pagerAlert:'Alerta PAGER',maxShaking:'Sacudida Máx. (MMI)',communityIntensity:'Intensidad Comunitaria',significance:'Significancia',azimuthalGap:'Brecha Azimutal',rmsResidual:'Residual RMS',stationsUsed:'Estaciones Usadas',network:'Red',
    beaufortScale:'Escala Beaufort',maxWindRadius:'Radio Máx. de Viento',heading:'Dirección',affectedCountries:'Países Afectados',started:'Iniciado',activeFor:'Activo por',lastUpdate:'Última Actualización',alertScore:'Puntuación de Alerta',
    firstObserved:'Primera Observación',lastObserved:'Última Observación',observations:'Observaciones',closed:'Cerrado',brightness:'Brillo',confidence:'Confianza',estimatedArea:'Área Est. de Pixel',region:'Región',
  
  },
  fr: {
    loading:'Chargement des données en temps réel...',connected:'Connecté',disconnected:'Déconnecté',live:'EN DIRECT',offline:'HORS LIGNE',close:'Fermer',back:'Retour',search:'Rechercher',share:'Partager',settings:'Paramètres',analytics:'Analytique',copyLink:'Copier le lien',linkCopied:'Lien copié !',viewFullDetails:'Voir tous les détails →',streamingLive:'Diffusion en direct',reconnecting:'Reconnexion...',unknown:'Inconnu',noData:'Pas de données',reports:'rapports',
    earthquakes:'Séismes',wildfires:'Feux de forêt',floods:'Inondations',cyclones:'Cyclones',volcanoes:'Volcans',droughts:'Sécheresses',landslides:'Glissements',tsunamis:'Tsunamis',spaceweather:'Météo Spatiale',fires:'Points Chauds',weather:'Alertes Météo',
    earthquake:'Séisme',wildfire:'Feu de forêt',flood:'Inondation',cyclone:'Cyclone',volcano:'Volcan',drought:'Sécheresse',landslide:'Glissement',tsunami:'Tsunami',hotspot:'Point Chaud',space:'Spatial',weatherAlert:'Météo',
    critical:'CRITIQUE',severe:'SÉVÈRE',moderate:'MODÉRÉ',minor:'MINEUR',active:'ACTIF',ended:'TERMINÉ',contained:'MAÎTRISÉ',activelyBurning:'EN FEU',justContained:'RÉCEMMENT MAÎTRISÉ',inactive:'Inactif',extreme:'EXTRÊME',warning:'AVERTISSEMENT',watch:'VEILLE',erupting:'EN ÉRUPTION',actual:'Réel',expected:'Attendu',likely:'Probable',
    totalEvents:'Total des événements',activeEvents:'Événements actifs',endedEvents:'Événements terminés',mostAffected:'Régions les plus touchées',severityDist:'Distribution de gravité',sourceHealth:'Santé des sources',criticalAlerts:'Alertes critiques',criticalAlert:'Alerte critique',
    liveFeed:'Flux en direct',newEvents:'nouveaux événements',noEvents:'En attente d\'événements...',autoScroll:'Défilement auto',
    zoomIn:'Zoomer pour plus de détails',searchLocation:'Rechercher un lieu...',viewDetails:'Voir les détails',magnitude:'Magnitude',depth:'Profondeur',nearby:'À proximité',kmAway:'km',location:'Lieu',coordinates:'Coordonnées',source:'Source',time:'Heure',event:'Événement',country:'Pays',areas:'Zones',population:'Population',popAtRisk:'Pop. à risque',affectedArea:'Zone affectée',
    seismicData:'Données sismiques',feltReports:'Rapports ressentis',alertLevel:'Niveau d\'alerte',tsunamiWarning:'ALERTE TSUNAMI ÉMISE',tsunamiWarningShort:'ALERTE TSUNAMI',shaking:'Secousses',magType:'Type',depthClass:'Classe de profondeur',
    stormData:'Données de tempête',stormType:'Type',category:'Catégorie',windSpeed:'Vitesse du vent',pressure:'Pression',track:'Trajectoire',movement:'Mouvement',windRadius:'Rayon de vent',basin:'Bassin',season:'Saison',
    fireStatus:'État de l\'incendie',alert:'Alerte',
    floodData:'Données d\'inondation',floodActive:'INONDATION ACTIVE',floodEnded:'Inondation terminée',severity:'Gravité',duration:'Durée',affected:'Affectés',fromDate:'Du',toDate:'Au',countries:'Pays',description:'Description',
    droughtData:'Données de sécheresse',droughtLevel:'Niveau',
    volcanoData:'Données volcaniques',alertColor:'Couleur d\'alerte',lastEruption:'Dernière éruption',elevation:'Altitude',type:'Type',
    landslideData:'Données de glissement',fatalities:'Victimes',trigger:'Cause',
    alertDetails:'Détails de l\'alerte',areaTiming:'Zone et horaire',headline:'Titre',certainty:'Certitude',response:'Réponse',status:'Statut',onset:'Début',expires:'Expire',timeLeft:'Temps restant',timeRemaining:'{time} restant',issuedBy:'Émis par',instruction:'Instructions',wind:'Vent',hail:'Grêle',tornado:'Tornade',flashFlood:'Crue subite',thunderstorm:'Orage',
    spaceWeatherData:'Données météo spatiale',tsunamiData:'Données de tsunami',
    locationCoords:'Localisation',sources:'Sources',timeline:'Chronologie',impact:'Impact',details:'Détails',parameters:'Paramètres',
    mapStyleTitle:'Style de carte',darkMode:'Sombre',satellite:'Satellite',terrain:'Terrain',light:'Clair',language:'Langue',sound:'Son',alertsTitle:'Alertes et notifications',browserNotifications:'Notifications du navigateur',alertSounds:'Sons d\'alerte',watchArea:'Zone de surveillance',clearWatchArea:'Effacer la zone',noWatchArea:'Aucune zone définie. Cliquez sur la carte.',emailDigest:'Résumé par email',emailDigestDesc:'Recevez un résumé des événements.',saveEmail:'Enregistrer l\'email',frequency:'Fréquence',off:'Désactivé',daily:'Quotidien',weekly:'Hebdomadaire',about:'À propos',
    disasterMonitor:'MONITEUR DE CATASTROPHES',layers:'COUCHES',controls:'CONTRÔLES',heatmap:'Carte thermique',alerts:'Alertes',clearWatch:'Effacer surveillance',actions:'ACTIONS',
    overview:'Aperçu',severityTab:'Gravité',sourcesTab:'Sources',eventsByType:'Événements par type',severityBar:'Barre de gravité',severityDistribution:'Distribution de gravité',mostAffectedRegions:'Régions les plus touchées',dataSourceHealth:'Santé des sources',lastFetchTimes:'Dernières mises à jour',noCountryData:'Aucune donnée disponible.',loadingServerStats:'Chargement...',events:'ÉVÉNEMENTS',count:'Nombre',updated:'Mis à jour',never:'Jamais',ok:'OK',noDataLabel:'PAS DE DONNÉES',
    justNow:'à l\'instant',secondsAgo:'il y a {n}s',minutesAgo:'il y a {n}m',hoursAgo:'il y a {n}h',daysAgo:'il y a {n}j',day:'jour',
    impactAssessment:'Évaluation d\'impact',stormClassification:'Classification de tempête',windAndPressure:'Vent et pression',movementDuration:'Mouvement et durée',extentImpact:'Étendue et impact',locationImpact:'Lieu et impact',externalLinks:'Liens externes',thermalDetection:'Détection thermique',
    pagerAlert:'Alerte PAGER',maxShaking:'Secousse max. (MMI)',communityIntensity:'Intensité communautaire',significance:'Significance',azimuthalGap:'Écart azimutal',rmsResidual:'Résidu RMS',stationsUsed:'Stations utilisées',network:'Réseau',
    beaufortScale:'Échelle Beaufort',maxWindRadius:'Rayon max. de vent',heading:'Cap',affectedCountries:'Pays affectés',started:'Débuté',activeFor:'Actif depuis',lastUpdate:'Dernière mise à jour',alertScore:'Score d\'alerte',
    firstObserved:'Première observation',lastObserved:'Dernière observation',observations:'Observations',closed:'Fermé',brightness:'Luminosité',confidence:'Confiance',estimatedArea:'Surface pixel est.',region:'Région',
  
  },
  pt: {
    loading:'Carregando dados em tempo real...',connected:'Conectado',disconnected:'Desconectado',live:'AO VIVO',offline:'OFFLINE',close:'Fechar',back:'Voltar',search:'Buscar',share:'Compartilhar',settings:'Configurações',analytics:'Análises',copyLink:'Copiar Link',linkCopied:'Link copiado!',viewFullDetails:'Ver Detalhes Completos →',streamingLive:'Transmitindo ao vivo',reconnecting:'Reconectando...',unknown:'Desconhecido',noData:'Sem dados',reports:'relatórios',
    earthquakes:'Terremotos',wildfires:'Incêndios',floods:'Enchentes',cyclones:'Ciclones',volcanoes:'Vulcões',droughts:'Secas',landslides:'Deslizamentos',tsunamis:'Tsunamis',spaceweather:'Clima Espacial',fires:'Pontos de Calor',weather:'Alertas Meteorológicos',
    earthquake:'Terremoto',wildfire:'Incêndio',flood:'Enchente',cyclone:'Ciclone',volcano:'Vulcão',drought:'Seca',landslide:'Deslizamento',tsunami:'Tsunami',hotspot:'Ponto de Calor',space:'Espacial',weatherAlert:'Clima',
    critical:'CRÍTICO',severe:'SEVERO',moderate:'MODERADO',minor:'MENOR',active:'ATIVO',ended:'ENCERRADO',contained:'CONTIDO',activelyBurning:'EM CHAMAS',justContained:'RECÉM CONTIDO',inactive:'Inativo',extreme:'EXTREMO',warning:'AVISO',watch:'VIGILÂNCIA',erupting:'EM ERUPÇÃO',actual:'Real',expected:'Esperado',likely:'Provável',
    totalEvents:'Total de Eventos',activeEvents:'Eventos Ativos',endedEvents:'Eventos Encerrados',mostAffected:'Regiões Mais Afetadas',severityDist:'Distribuição de Severidade',sourceHealth:'Saúde das Fontes',criticalAlerts:'Alertas Críticos',criticalAlert:'Alerta Crítico',
    liveFeed:'Feed ao Vivo',newEvents:'novos eventos',noEvents:'Aguardando eventos...',autoScroll:'Rolagem automática',
    zoomIn:'Aproxime para detalhes',searchLocation:'Buscar localização...',viewDetails:'Ver Detalhes',magnitude:'Magnitude',depth:'Profundidade',nearby:'Próximo',kmAway:'km',location:'Localização',coordinates:'Coordenadas',source:'Fonte',time:'Hora',event:'Evento',country:'País',areas:'Áreas',population:'População',popAtRisk:'Pop. em Risco',affectedArea:'Área Afetada',
    seismicData:'Dados Sísmicos',feltReports:'Relatos Sentidos',alertLevel:'Nível de Alerta',tsunamiWarning:'ALERTA DE TSUNAMI EMITIDO',tsunamiWarningShort:'ALERTA DE TSUNAMI',shaking:'Tremor',magType:'Tipo',depthClass:'Classe de Profundidade',
    stormData:'Dados da Tempestade',stormType:'Tipo',category:'Categoria',windSpeed:'Velocidade do Vento',pressure:'Pressão',track:'Trajetória',movement:'Movimento',windRadius:'Raio de Vento',basin:'Bacia',season:'Temporada',
    fireStatus:'Status do Incêndio',alert:'Alerta',
    floodData:'Dados da Enchente',floodActive:'ENCHENTE ATIVA',floodEnded:'Enchente Encerrada',severity:'Severidade',duration:'Duração',affected:'Afetados',fromDate:'De',toDate:'Até',countries:'Países',description:'Descrição',
    droughtData:'Dados da Seca',droughtLevel:'Nível',
    volcanoData:'Dados do Vulcão',alertColor:'Cor de Alerta',lastEruption:'Última Erupção',elevation:'Elevação',type:'Tipo',
    landslideData:'Dados do Deslizamento',fatalities:'Fatalidades',trigger:'Causa',
    alertDetails:'Detalhes do Alerta',areaTiming:'Área e Horário',headline:'Manchete',certainty:'Certeza',response:'Resposta',status:'Status',onset:'Início',expires:'Expira',timeLeft:'Tempo Restante',timeRemaining:'{time} restante',issuedBy:'Emitido Por',instruction:'Instruções',wind:'Vento',hail:'Granizo',tornado:'Tornado',flashFlood:'Enchente Relâmpago',thunderstorm:'Tempestade',
    spaceWeatherData:'Dados de Clima Espacial',tsunamiData:'Dados de Tsunami',
    locationCoords:'Localização',sources:'Fontes',timeline:'Linha do Tempo',impact:'Impacto',details:'Detalhes',parameters:'Parâmetros',
    mapStyleTitle:'Estilo do Mapa',darkMode:'Escuro',satellite:'Satélite',terrain:'Terreno',light:'Claro',language:'Idioma',sound:'Som',alertsTitle:'Alertas e Notificações',browserNotifications:'Notificações do Navegador',alertSounds:'Sons de Alerta',watchArea:'Área de Vigilância',clearWatchArea:'Limpar Área',noWatchArea:'Nenhuma área definida. Clique no mapa.',emailDigest:'Resumo por Email',emailDigestDesc:'Receba um resumo dos eventos.',saveEmail:'Salvar Email',frequency:'Frequência',off:'Desligado',daily:'Diário',weekly:'Semanal',about:'Sobre',
    disasterMonitor:'MONITOR DE DESASTRES',layers:'CAMADAS',controls:'CONTROLES',heatmap:'Mapa de Calor',alerts:'Alertas',clearWatch:'Limpar Vigilância',actions:'AÇÕES',
    overview:'Visão Geral',severityTab:'Severidade',sourcesTab:'Fontes',eventsByType:'Eventos por Tipo',severityBar:'Barra de Severidade',severityDistribution:'Distribuição de Severidade',mostAffectedRegions:'Regiões Mais Afetadas',dataSourceHealth:'Saúde das Fontes',lastFetchTimes:'Últimas Atualizações',noCountryData:'Sem dados disponíveis.',loadingServerStats:'Carregando...',events:'EVENTOS',count:'Contagem',updated:'Atualizado',never:'Nunca',ok:'OK',noDataLabel:'SEM DADOS',
    justNow:'agora',secondsAgo:'{n}s atrás',minutesAgo:'{n}m atrás',hoursAgo:'{n}h atrás',daysAgo:'{n}d atrás',day:'dia',
    impactAssessment:'Avaliação de Impacto',stormClassification:'Classificação da Tempestade',windAndPressure:'Vento e Pressão',movementDuration:'Movimento e Duração',extentImpact:'Extensão e Impacto',locationImpact:'Localização e Impacto',externalLinks:'Links Externos',thermalDetection:'Detecção Térmica',
    pagerAlert:'Alerta PAGER',maxShaking:'Tremor Máx. (MMI)',communityIntensity:'Intensidade Comunitária',significance:'Significância',azimuthalGap:'Lacuna Azimutal',rmsResidual:'Residual RMS',stationsUsed:'Estações Usadas',network:'Rede',
    beaufortScale:'Escala Beaufort',maxWindRadius:'Raio Máx. de Vento',heading:'Direção',affectedCountries:'Países Afetados',started:'Iniciado',activeFor:'Ativo há',lastUpdate:'Última Atualização',alertScore:'Pontuação de Alerta',
    firstObserved:'Primeira Observação',lastObserved:'Última Observação',observations:'Observações',closed:'Fechado',brightness:'Brilho',confidence:'Confiança',estimatedArea:'Área Est. de Pixel',region:'Região',

  
  
  },
  ar: {
    loading:'جاري تحميل بيانات الكوارث...',connected:'متصل',disconnected:'غير متصل',live:'مباشر',offline:'غير متصل',close:'إغلاق',back:'رجوع',search:'بحث',share:'مشاركة',settings:'الإعدادات',analytics:'التحليلات',copyLink:'نسخ الرابط',linkCopied:'تم نسخ الرابط!',viewFullDetails:'عرض التفاصيل الكاملة ←',streamingLive:'بث مباشر',reconnecting:'إعادة الاتصال...',unknown:'غير معروف',noData:'لا توجد بيانات',reports:'تقارير',
    earthquakes:'الزلازل',wildfires:'حرائق الغابات',floods:'الفيضانات',cyclones:'الأعاصير',volcanoes:'البراكين',droughts:'الجفاف',landslides:'الانهيارات',tsunamis:'تسونامي',spaceweather:'طقس الفضاء',fires:'نقاط الحرارة',weather:'تنبيهات الطقس',
    earthquake:'زلزال',wildfire:'حريق',flood:'فيضان',cyclone:'إعصار',volcano:'بركان',drought:'جفاف',landslide:'انهيار',tsunami:'تسونامي',hotspot:'نقطة ساخنة',space:'فضائي',weatherAlert:'طقس',
    critical:'حرج',severe:'شديد',moderate:'متوسط',minor:'طفيف',active:'نشط',ended:'منتهي',contained:'محتوى',activelyBurning:'يحترق بنشاط',justContained:'تم احتواؤه',inactive:'غير نشط',extreme:'شديد جداً',warning:'تحذير',watch:'مراقبة',erupting:'ثائر',actual:'فعلي',expected:'متوقع',likely:'محتمل',
    totalEvents:'إجمالي الأحداث',activeEvents:'الأحداث النشطة',endedEvents:'الأحداث المنتهية',mostAffected:'المناطق الأكثر تأثراً',severityDist:'توزيع الشدة',sourceHealth:'صحة المصادر',criticalAlerts:'تنبيهات حرجة',criticalAlert:'تنبيه حرج',
    liveFeed:'البث المباشر',newEvents:'أحداث جديدة',noEvents:'في انتظار الأحداث...',autoScroll:'تمرير تلقائي',
    zoomIn:'تكبير للتفاصيل',searchLocation:'البحث عن موقع...',viewDetails:'عرض التفاصيل',magnitude:'القوة',depth:'العمق',nearby:'قريب',kmAway:'كم',location:'الموقع',coordinates:'الإحداثيات',source:'المصدر',time:'الوقت',event:'الحدث',country:'البلد',areas:'المناطق',population:'السكان',popAtRisk:'السكان المعرضون',affectedArea:'المنطقة المتأثرة',
    seismicData:'البيانات الزلزالية',feltReports:'تقارير الشعور',alertLevel:'مستوى التنبيه',tsunamiWarning:'تحذير تسونامي صادر',tsunamiWarningShort:'تحذير تسونامي',shaking:'الاهتزاز',magType:'النوع',depthClass:'فئة العمق',
    stormData:'بيانات العاصفة',stormType:'النوع',category:'الفئة',windSpeed:'سرعة الرياح',pressure:'الضغط',track:'المسار',movement:'الحركة',windRadius:'نطاق الرياح',basin:'الحوض',season:'الموسم',
    fireStatus:'حالة الحريق',alert:'تنبيه',
    floodData:'بيانات الفيضان',floodActive:'فيضان نشط',floodEnded:'انتهى الفيضان',severity:'الشدة',duration:'المدة',affected:'المتأثرون',fromDate:'من',toDate:'إلى',countries:'الدول',description:'الوصف',
    droughtData:'بيانات الجفاف',droughtLevel:'المستوى',
    volcanoData:'بيانات البركان',alertColor:'لون التنبيه',lastEruption:'آخر ثوران',elevation:'الارتفاع',type:'النوع',
    landslideData:'بيانات الانهيار',fatalities:'الوفيات',trigger:'السبب',
    alertDetails:'تفاصيل التنبيه',areaTiming:'المنطقة والتوقيت',headline:'العنوان',certainty:'اليقين',response:'الاستجابة',status:'الحالة',onset:'البدء',expires:'ينتهي',timeLeft:'الوقت المتبقي',timeRemaining:'{time} متبقي',issuedBy:'صادر من',instruction:'التعليمات',wind:'رياح',hail:'برد',tornado:'إعصار قمعي',flashFlood:'فيضان مفاجئ',thunderstorm:'عاصفة رعدية',
    spaceWeatherData:'بيانات طقس الفضاء',tsunamiData:'بيانات تسونامي',
    locationCoords:'الموقع',sources:'المصادر',timeline:'الجدول الزمني',impact:'التأثير',details:'التفاصيل',parameters:'المعلمات',
    mapStyleTitle:'نمط الخريطة',darkMode:'داكن',satellite:'قمر صناعي',terrain:'تضاريس',light:'فاتح',language:'اللغة',sound:'الصوت',alertsTitle:'التنبيهات والإشعارات',browserNotifications:'إشعارات المتصفح',alertSounds:'أصوات التنبيه',watchArea:'منطقة المراقبة',clearWatchArea:'مسح المنطقة',noWatchArea:'لا توجد منطقة مراقبة.',emailDigest:'ملخص البريد',emailDigestDesc:'احصل على ملخص للأحداث.',saveEmail:'حفظ البريد',frequency:'التكرار',off:'إيقاف',daily:'يومي',weekly:'أسبوعي',about:'حول',
    disasterMonitor:'مراقب الكوارث',layers:'الطبقات',controls:'أدوات التحكم',heatmap:'خريطة حرارية',alerts:'تنبيهات',clearWatch:'مسح المراقبة',actions:'الإجراءات',
    overview:'نظرة عامة',severityTab:'الشدة',sourcesTab:'المصادر',eventsByType:'الأحداث حسب النوع',severityBar:'شريط الشدة',severityDistribution:'توزيع الشدة',mostAffectedRegions:'المناطق الأكثر تأثراً',dataSourceHealth:'صحة المصادر',lastFetchTimes:'أوقات آخر تحديث',noCountryData:'لا توجد بيانات.',loadingServerStats:'جاري التحميل...',events:'الأحداث',count:'العدد',updated:'محدث',never:'أبداً',ok:'OK',noDataLabel:'لا بيانات',
    justNow:'الآن',secondsAgo:'منذ {n}ث',minutesAgo:'منذ {n}د',hoursAgo:'منذ {n}س',daysAgo:'منذ {n}ي',day:'يوم',
    impactAssessment:'تقييم التأثير',stormClassification:'تصنيف العاصفة',windAndPressure:'الرياح والضغط',movementDuration:'الحركة والمدة',extentImpact:'النطاق والتأثير',locationImpact:'الموقع والتأثير',externalLinks:'روابط خارجية',thermalDetection:'الكشف الحراري',
    pagerAlert:'تنبيه PAGER',maxShaking:'أقصى اهتزاز (MMI)',communityIntensity:'شدة المجتمع',significance:'الأهمية',azimuthalGap:'الفجوة السمتية',rmsResidual:'بقايا RMS',stationsUsed:'المحطات المستخدمة',network:'الشبكة',
    beaufortScale:'مقياس بوفورت',maxWindRadius:'أقصى نصف قطر الرياح',heading:'الاتجاه',affectedCountries:'الدول المتأثرة',started:'بدأ',activeFor:'نشط منذ',lastUpdate:'آخر تحديث',alertScore:'درجة التنبيه',
    firstObserved:'أول رصد',lastObserved:'آخر رصد',observations:'الملاحظات',closed:'مغلق',brightness:'السطوع',confidence:'الثقة',estimatedArea:'مساحة البكسل المقدرة',region:'المنطقة',
  
  },
  zh: {
    loading:'正在加载实时灾害数据...',connected:'已连接',disconnected:'已断开',live:'直播',offline:'离线',close:'关闭',back:'返回',search:'搜索',share:'分享',settings:'设置',analytics:'分析',copyLink:'复制链接',linkCopied:'链接已复制！',viewFullDetails:'查看完整详情 →',streamingLive:'实时传输中',reconnecting:'正在重连...',unknown:'未知',noData:'无数据',reports:'报告',
    earthquakes:'地震',wildfires:'野火',floods:'洪水',cyclones:'气旋',volcanoes:'火山',droughts:'干旱',landslides:'滑坡',tsunamis:'海啸',spaceweather:'空间天气',fires:'热点',weather:'天气预警',
    earthquake:'地震',wildfire:'野火',flood:'洪水',cyclone:'气旋',volcano:'火山',drought:'干旱',landslide:'滑坡',tsunami:'海啸',hotspot:'热点',space:'空间',weatherAlert:'天气',
    critical:'危急',severe:'严重',moderate:'中等',minor:'轻微',active:'活跃',ended:'已结束',contained:'已控制',activelyBurning:'正在燃烧',justContained:'刚控制',inactive:'不活跃',extreme:'极端',warning:'警告',watch:'监视',erupting:'正在喷发',actual:'实际',expected:'预期',likely:'可能',
    totalEvents:'事件总数',activeEvents:'活跃事件',endedEvents:'已结束事件',mostAffected:'受影响最大地区',severityDist:'严重程度分布',sourceHealth:'数据源状况',criticalAlerts:'紧急警报',criticalAlert:'紧急警报',
    liveFeed:'实时动态',newEvents:'个新事件',noEvents:'等待事件中...',autoScroll:'自动滚动',
    zoomIn:'放大查看详情',searchLocation:'搜索位置...',viewDetails:'查看详情',magnitude:'震级',depth:'深度',nearby:'附近',kmAway:'公里',location:'位置',coordinates:'坐标',source:'来源',time:'时间',event:'事件',country:'国家',areas:'区域',population:'人口',popAtRisk:'受威胁人口',affectedArea:'受影响面积',
    seismicData:'地震数据',feltReports:'感知报告',alertLevel:'警报级别',tsunamiWarning:'海啸警报已发布',tsunamiWarningShort:'海啸警报',shaking:'震感',magType:'类型',depthClass:'深度等级',
    stormData:'风暴数据',stormType:'类型',category:'类别',windSpeed:'风速',pressure:'气压',track:'路径',movement:'移动',windRadius:'风力半径',basin:'海盆',season:'季节',
    fireStatus:'火灾状态',alert:'警报',
    floodData:'洪水数据',floodActive:'活跃洪水',floodEnded:'洪水已结束',severity:'严重程度',duration:'持续时间',affected:'受影响',fromDate:'从',toDate:'到',countries:'国家',description:'描述',
    droughtData:'干旱数据',droughtLevel:'级别',
    volcanoData:'火山数据',alertColor:'警报颜色',lastEruption:'上次喷发',elevation:'海拔',type:'类型',
    landslideData:'滑坡数据',fatalities:'死亡人数',trigger:'触发原因',
    alertDetails:'警报详情',areaTiming:'区域和时间',headline:'标题',certainty:'确定性',response:'响应',status:'状态',onset:'开始',expires:'到期',timeLeft:'剩余时间',timeRemaining:'剩余 {time}',issuedBy:'发布者',instruction:'指导',wind:'风',hail:'冰雹',tornado:'龙卷风',flashFlood:'山洪',thunderstorm:'雷暴',
    spaceWeatherData:'空间天气数据',tsunamiData:'海啸数据',
    locationCoords:'位置',sources:'来源',timeline:'时间线',impact:'影响',details:'详情',parameters:'参数',
    mapStyleTitle:'地图样式',darkMode:'暗色',satellite:'卫星',terrain:'地形',light:'亮色',language:'语言',sound:'声音',alertsTitle:'警报和通知',browserNotifications:'浏览器通知',alertSounds:'警报声音',watchArea:'监视区域',clearWatchArea:'清除监视区域',noWatchArea:'未设置监视区域。',emailDigest:'邮件摘要',emailDigestDesc:'接收事件摘要。',saveEmail:'保存邮箱',frequency:'频率',off:'关闭',daily:'每日',weekly:'每周',about:'关于',
    disasterMonitor:'灾害监控',layers:'图层',controls:'控制',heatmap:'热力图',alerts:'警报',clearWatch:'清除监视',actions:'操作',
    overview:'概览',severityTab:'严重程度',sourcesTab:'数据源',eventsByType:'按类型分类',severityBar:'严重程度条',severityDistribution:'严重程度分布',mostAffectedRegions:'受影响最大地区',dataSourceHealth:'数据源状况',lastFetchTimes:'最近更新时间',noCountryData:'暂无国家数据。',loadingServerStats:'加载中...',events:'事件',count:'数量',updated:'更新',never:'从未',ok:'正常',noDataLabel:'无数据',
    justNow:'刚刚',secondsAgo:'{n}秒前',minutesAgo:'{n}分钟前',hoursAgo:'{n}小时前',daysAgo:'{n}天前',day:'天',
    impactAssessment:'影响评估',stormClassification:'风暴分类',windAndPressure:'风力与气压',movementDuration:'移动与持续时间',extentImpact:'范围与影响',locationImpact:'位置与影响',externalLinks:'外部链接',thermalDetection:'热检测',
    pagerAlert:'PAGER警报',maxShaking:'最大震感(MMI)',communityIntensity:'社区强度',significance:'重要性',azimuthalGap:'方位角间隙',rmsResidual:'RMS残差',stationsUsed:'使用站点',network:'网络',
    beaufortScale:'蒲福风力等级',maxWindRadius:'最大风力半径',heading:'航向',affectedCountries:'受影响国家',started:'开始',activeFor:'已活跃',lastUpdate:'最后更新',alertScore:'警报分数',
    firstObserved:'首次观测',lastObserved:'最后观测',observations:'观测次数',closed:'已关闭',brightness:'亮度',confidence:'可信度',estimatedArea:'像素面积估算',region:'区域',
 
  },
  hi: {
    loading:'रियल-टाइम आपदा डेटा लोड हो रहा है...',connected:'कनेक्टेड',disconnected:'डिस्कनेक्टेड',live:'लाइव',offline:'ऑफ़लाइन',close:'बंद करें',back:'वापस',search:'खोजें',share:'शेयर',settings:'सेटिंग्स',analytics:'विश्लेषण',copyLink:'लिंक कॉपी करें',linkCopied:'लिंक कॉपी हो गया!',viewFullDetails:'पूरा विवरण देखें →',streamingLive:'लाइव स्ट्रीमिंग',reconnecting:'पुनः कनेक्ट हो रहा है...',unknown:'अज्ञात',noData:'कोई डेटा नहीं',reports:'रिपोर्ट',
    earthquakes:'भूकंप',wildfires:'जंगल की आग',floods:'बाढ़',cyclones:'चक्रवात',volcanoes:'ज्वालामुखी',droughts:'सूखा',landslides:'भूस्खलन',tsunamis:'सुनामी',spaceweather:'अंतरिक्ष मौसम',fires:'हॉटस्पॉट',weather:'मौसम चेतावनी',
    earthquake:'भूकंप',wildfire:'आग',flood:'बाढ़',cyclone:'चक्रवात',volcano:'ज्वालामुखी',drought:'सूखा',landslide:'भूस्खलन',tsunami:'सुनामी',hotspot:'हॉटस्पॉट',space:'अंतरिक्ष',weatherAlert:'मौसम',
    critical:'गंभीर',severe:'तीव्र',moderate:'मध्यम',minor:'मामूली',active:'सक्रिय',ended:'समाप्त',contained:'नियंत्रित',activelyBurning:'जल रहा है',justContained:'अभी नियंत्रित',inactive:'निष्क्रिय',extreme:'अत्यंत',warning:'चेतावनी',watch:'निगरानी',erupting:'विस्फोट',actual:'वास्तविक',expected:'अपेक्षित',likely:'संभावित',
    totalEvents:'कुल घटनाएं',activeEvents:'सक्रिय घटनाएं',endedEvents:'समाप्त घटनाएं',mostAffected:'सबसे प्रभावित क्षेत्र',severityDist:'गंभीरता वितरण',sourceHealth:'स्रोत स्वास्थ्य',criticalAlerts:'गंभीर अलर्ट',criticalAlert:'गंभीर अलर्ट',
    liveFeed:'लाइव फीड',newEvents:'नई घटनाएं',noEvents:'घटनाओं की प्रतीक्षा...',autoScroll:'ऑटो-स्क्रॉल',
    zoomIn:'विवरण के लिए ज़ूम करें',searchLocation:'स्थान खोजें...',viewDetails:'विवरण देखें',magnitude:'तीव्रता',depth:'गहराई',nearby:'पास',kmAway:'किमी',location:'स्थान',coordinates:'निर्देशांक',source:'स्रोत',time:'समय',event:'घटना',country:'देश',areas:'क्षेत्र',population:'जनसंख्या',popAtRisk:'जोखिम में जनसंख्या',affectedArea:'प्रभावित क्षेत्र',
    seismicData:'भूकंपीय डेटा',feltReports:'अनुभव रिपोर्ट',alertLevel:'अलर्ट स्तर',tsunamiWarning:'सुनामी चेतावनी जारी',tsunamiWarningShort:'सुनामी चेतावनी',shaking:'कंपन',magType:'प्रकार',depthClass:'गहराई वर्ग',
    stormData:'तूफान डेटा',stormType:'प्रकार',category:'श्रेणी',windSpeed:'हवा की गति',pressure:'दबाव',track:'पथ',movement:'गति',windRadius:'पवन त्रिज्या',basin:'बेसिन',season:'मौसम',
    fireStatus:'आग की स्थिति',alert:'अलर्ट',
    floodData:'बाढ़ डेटा',floodActive:'सक्रिय बाढ़',floodEnded:'बाढ़ समाप्त',severity:'गंभीरता',duration:'अवधि',affected:'प्रभावित',fromDate:'से',toDate:'तक',countries:'देश',description:'विवरण',
    droughtData:'सूखा डेटा',droughtLevel:'स्तर',
    volcanoData:'ज्वालामुखी डेटा',alertColor:'अलर्ट रंग',lastEruption:'अंतिम विस्फोट',elevation:'ऊंचाई',type:'प्रकार',
    landslideData:'भूस्खलन डेटा',fatalities:'मृत्यु',trigger:'कारण',
    alertDetails:'अलर्ट विवरण',areaTiming:'क्षेत्र और समय',headline:'शीर्षक',certainty:'निश्चितता',response:'प्रतिक्रिया',status:'स्थिति',onset:'शुरुआत',expires:'समाप्ति',timeLeft:'शेष समय',timeRemaining:'{time} शेष',issuedBy:'द्वारा जारी',instruction:'निर्देश',wind:'हवा',hail:'ओले',tornado:'बवंडर',flashFlood:'अचानक बाढ़',thunderstorm:'तूफान',
    spaceWeatherData:'अंतरिक्ष मौसम डेटा',tsunamiData:'सुनामी डेटा',
    locationCoords:'स्थान',sources:'स्रोत',timeline:'समयरेखा',impact:'प्रभाव',details:'विवरण',parameters:'पैरामीटर',
    mapStyleTitle:'मानचित्र शैली',darkMode:'डार्क',satellite:'सैटेलाइट',terrain:'भूभाग',light:'लाइट',language:'भाषा',sound:'ध्वनि',alertsTitle:'अलर्ट और सूचनाएं',browserNotifications:'ब्राउज़र सूचनाएं',alertSounds:'अलर्ट ध्वनि',watchArea:'निगरानी क्षेत्र',clearWatchArea:'क्षेत्र साफ़ करें',noWatchArea:'कोई निगरानी क्षेत्र नहीं।',emailDigest:'ईमेल सारांश',emailDigestDesc:'घटनाओं का सारांश प्राप्त करें।',saveEmail:'ईमेल सहेजें',frequency:'आवृत्ति',off:'बंद',daily:'दैनिक',weekly:'साप्ताहिक',about:'के बारे में',
    disasterMonitor:'आपदा मॉनिटर',layers:'परतें',controls:'नियंत्रण',heatmap:'हीट मैप',alerts:'अलर्ट',clearWatch:'निगरानी साफ़ करें',actions:'कार्रवाई',
    overview:'अवलोकन',severityTab:'गंभीरता',sourcesTab:'स्रोत',eventsByType:'प्रकार के अनुसार',severityBar:'गंभीरता बार',severityDistribution:'गंभीरता वितरण',mostAffectedRegions:'सबसे प्रभावित क्षेत्र',dataSourceHealth:'डेटा स्रोत स्वास्थ्य',lastFetchTimes:'अंतिम अपडेट',noCountryData:'देश डेटा उपलब्ध नहीं।',loadingServerStats:'लोड हो रहा है...',events:'घटनाएं',count:'गिनती',updated:'अपडेट',never:'कभी नहीं',ok:'OK',noDataLabel:'कोई डेटा नहीं',
    justNow:'अभी',secondsAgo:'{n}स पहले',minutesAgo:'{n}मि पहले',hoursAgo:'{n}घं पहले',daysAgo:'{n}दि पहले',day:'दिन',
    impactAssessment:'प्रभाव आकलन',stormClassification:'तूफान वर्गीकरण',windAndPressure:'हवा और दबाव',movementDuration:'गति और अवधि',extentImpact:'विस्तार और प्रभाव',locationImpact:'स्थान और प्रभाव',externalLinks:'बाहरी लिंक',thermalDetection:'ताप पहचान',
    pagerAlert:'PAGER अलर्ट',maxShaking:'अधिकतम कंपन (MMI)',communityIntensity:'सामुदायिक तीव्रता',significance:'महत्व',azimuthalGap:'दिगंशीय अंतर',rmsResidual:'RMS अवशेष',stationsUsed:'प्रयुक्त स्टेशन',network:'नेटवर्क',
    beaufortScale:'ब्यूफोर्ट पैमाना',maxWindRadius:'अधिकतम पवन त्रिज्या',heading:'दिशा',affectedCountries:'प्रभावित देश',started:'शुरू',activeFor:'सक्रिय',lastUpdate:'अंतिम अपडेट',alertScore:'अलर्ट स्कोर',
    firstObserved:'पहला अवलोकन',lastObserved:'अंतिम अवलोकन',observations:'अवलोकन',closed:'बंद',brightness:'चमक',confidence:'विश्वसनीयता',estimatedArea:'अनुमानित पिक्सेल क्षेत्र',region:'क्षेत्र',
 
  }
};

const I18nContext = createContext({ lang: 'en', t: (key) => key, timeAgo: (ts) => '' });

export const I18nProvider = ({ language = 'en', children }) => {
  const strings = TRANSLATIONS[language] || TRANSLATIONS.en;
  const fallback = TRANSLATIONS.en;

  const t = useCallback((key, params = {}) => {
    let str = strings[key] || fallback[key] || key;
    Object.entries(params).forEach(([k, v]) => { str = str.replace(`{${k}}`, v); });
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
    lang: language, dir: LANGUAGES[language]?.dir || 'ltr', t, timeAgo
  }), [language, t, timeAgo]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useTranslation = () => useContext(I18nContext);
export default I18nProvider;