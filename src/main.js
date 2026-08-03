import './style.css';
import {
  PassauPixelRenderer,
  compileWallGrid,
  createLevelDocument,
  reachableTileKeys,
} from '@franz-lola/pixel-renderer';
import { FixedStepLoop } from './core/fixed-step-loop.js';
import { moveGridActor } from './game/grid-motion.js';
import { aggregateProgress } from './game/progress-system.js';
import { BrowserSaveStore } from './platform/browser-save-store.js';

const canvas = document.querySelector('#game');
const pixelRenderer = new PassauPixelRenderer(canvas, { zoom: 1.12 });
const simulationLoop = new FixedStepLoop({ updatesPerSecond: 120 });
const saveStore = new BrowserSaveStore();

const COLS = 25;
const ROWS = 25;
const TILE = 24;
const BOARD_SIZE = COLS * TILE;
const SCENE_PIXEL_RATIO = 2;
const TUNNEL_ROW = 12;
const SAVE_KEY = 'gassi-runde-hals-save';
const LEGACY_BEST_KEY = 'gassi-runde-best';
const SAVE_VERSION = 6;
const EASTER_EGG_COUNT = 3;
const SWIPE_ACTIVATION_DISTANCE = 4;
const PLAYER_TURN_SNAP_DISTANCE = 0.28;
const CAMERA_ZOOM = 1.12;
const BELL_SEQUENCE = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'];

const TEXT = {
  standard: {
    eyebrow: 'EIN KLEINES ABENTEUER AUS PASSAU',
    scoreLabel: 'PUNKTE', bestLabel: 'BESTE RUNDE', roundLabel: 'LEVEL', livesLabel: 'LEINEN',
    globalProgressLabel: 'PASSAU-FORTSCHRITT',
    mapKicker: 'DEINE GASSI-KARTE', mapTitle: 'Wo geht es heute hin?',
    mapCopy: 'Wähle einen Ort in Passau. Die Abstände der Punkte sind geografisch skaliert.',
    mapStart: 'LEVEL STARTEN →', mapResume: 'WEITERGASSI →', mapButton: 'PASSAU-KARTE',
    settingsLabel: 'EINSTELLUNGEN', settingsKicker: 'SPIEL & DARSTELLUNG', settingsTitle: 'Gassi-Zentrale',
    settingsSystemLabel: 'SYSTEM', settingsCloseLabel: 'Einstellungen schließen',
    menuLabel: 'MENÜ', levelIntroKicker: 'KURZ DIE LEINE SORTIEREN', levelIntroTitle: '{place}',
    levelIntroCopy: '{description}', controlIntroHint: 'Wische in die gewünschte Richtung. Lola übernimmt den Richtungswechsel sofort.',
    controlMenuHint: 'Mobil wischen, am Desktop Pfeiltasten oder WASD verwenden.',
    difficultyLabel: 'SCHWIERIGKEIT', difficultyEasy: 'Spaziergang', difficultyNormal: 'Gassirunde', difficultyHard: 'Abenteuer',
    easyHint: '2 Katzen · 5 Leinen · 70 Guttis · lange Schnüffel-Power',
    normalHint: '3 Katzen · 3 Leinen · 110 Guttis · ausgewogenes Tempo',
    hardHint: '3 schnelle Katzen · 2 Leinen · 160 Guttis',
    treatProgressLabel: 'GUTTIS GESAMMELT',
    languageLabel: 'SPRACHE', standardButton: 'Schönes Deutsch', dialectButton: 'Niederbairisch*',
    languageJoke: '* Amtlich keine eigene Sprache – aber versuchen Sie das einmal einem Niederbayern zu erklären.',
    flavourQuote: '„Nur noch eine kleine Runde.“', flavourByline: '— Franz, seit 45 Minuten',
    keyHint: 'PFEILTASTEN / WASD · P ZUM PAUSIEREN', mobileHint: 'WISCHEN LENKT SOFORT',
    mobileBackMap: 'PASSAU-KARTE', enterFullscreenLabel: 'Vollbild aktivieren', exitFullscreenLabel: 'Vollbild verlassen',
    routeOne: 'START', routeTwo: 'GUTTIS', routeThree: 'ZIEL', secretsLabel: 'PASSAU-GEHEIMNISSE',
    guideLabel: 'GASSI-GUIDE', treatTitle: 'Gutti', treatCopy: '+10 Punkte',
    powerTitle: 'Schnüffel-Power', powerCopy: 'Die Katzen suchen das Weite',
    catTitle: 'Nachbarskatzen', catCopy: 'Lieber Abstand halten', controlsLabel: 'STEUERUNG', orLabel: 'oder',
    footerPlace: 'PASSAU · STADT & FLÜSSE', footerTagline: 'PIXEL FÜR PIXEL DURCH DIE NACHT',
    saveSuccess: 'IM BROWSER GESPEICHERT', saveBlocked: 'SPEICHER IST GESPERRT',
    pause: 'Ⅱ  PAUSE', continue: '▶  WEITER', soundOn: '♪  TON AN', soundOff: '♪  TON AUS',
    startKicker: 'DIE ABENDRUNDE BEGINNT', startTitle: 'Los geht’s, Franz!',
    startCopy: 'Sammle alle Guttis ein, halte Abstand zu den Nachbarskatzen und bringe Lola sicher ans Ziel.',
    startButton: 'AUF GEHT’S →', resumeKicker: 'DEINE RUNDE IST NOCH DA', resumeTitle: 'Willkommen zurück, Franz!',
    resumeCopy: 'Level {level}, {score} Punkte und {lives} {leash} wurden sicher im Browser gespeichert.',
    resumeButton: 'WEITERGASSI →', leashOne: 'Leine', leashMany: 'Leinen',
    pauseKicker: 'EINE KLEINE VERSCHNAUFPAUSE', pauseTitle: 'Warte kurz, Lola!',
    pauseCopy: 'Die Runde ist pausiert. Franz bindet sich nur schnell einen Schuh.', pauseButton: 'WEITER GEHT’S →',
    winKicker: 'ALLE GUTTIS SIND EINGESAMMELT', winTitle: 'Sauber, das war’s!',
    winCopy: 'Lola ist zufrieden und Franz ein wenig müde. Dieser Ort ist jetzt auf der Passau-Karte abgehakt.',
    winButton: 'ZUR PASSAU-KARTE →', overKicker: 'DIE KATZEN WAREN HEUTE SCHNELLER', overTitle: 'Jetzt geht es heim.',
    overCopy: 'Franz und Lola haben {score} Punkte gesammelt. Morgen versuchen sie es wieder.', overButton: 'NOCH EINMAL →',
    playAnnouncement: 'Auf geht es mit Franz und Lola', powerAnnouncement: 'Schnüffel-Power! Die Katzen suchen das Weite',
    eggIlz: 'Donnerwetter, ein Eisvogel an der Ilz!', eggPark: 'Lola hat ihren Lieblingsplatz gefunden!',
    eggBell: 'Bim bam! Die Passauer Glocken läuten nur für euch.', secretFound: 'Geheimnis entdeckt: {message}',
    missionPrefix: 'HEUTIGE RUNDE', mapSelected: 'AUSGEWÄHLT', mapCompleted: 'GESCHAFFT',
    mapStatsTreats: 'GUTTIS', mapStatsAttempts: 'VERSUCHE', mapStatsScore: 'BESTE PUNKTE',
    mapStatsStatus: 'STATUS', mapStatsOpen: 'NOCH OFFEN', mapStatsActive: 'AKTIVE RUNDE',
    mapStatsDone: 'GESCHAFFT', mapDetailsClose: 'Ortsdetails schließen',
    mapAggregateLevels: 'LEVEL ABGESCHLOSSEN', mapAggregateTreats: 'GUTTIS GEFUNDEN',
    levelScoreLabel: 'LEVEL-PUNKTE', levelRemainingLabel: 'NOCH OFFEN',
    finaleKicker: '100% PASSAU', finaleTitle: 'Ganz Passau ist geschafft!',
    finaleCopy: 'Franz und Lola haben alle neun Gassi-Orte erkundet. Jedes Gutti, jeder Umweg und jede Leine haben sich gelohnt.',
    finaleButton: 'ZUR EHRENRUNDE →',
    newGameButton: '↺ NEUER SPIELSTAND', newGameKicker: 'WIRKLICH NEU ANFANGEN?',
    newGameTitle: 'Eine neue Gassi-Karte?',
    newGameCopy: 'Punkte, Orts-Häkchen und Geheimnisse werden gelöscht. Sprache, Ton und Schwierigkeit bleiben erhalten.',
    newGameConfirm: 'JA, NEU STARTEN', cancelButton: 'ABBRECHEN',
    deleteBrowserDataButton: '⚠ ALLE BROWSERDATEN LÖSCHEN',
    deleteDataKicker: 'LETZTE SICHERHEITSABFRAGE', deleteDataTitle: 'Die komplette Akte vernichten?',
    deleteDataCopy: 'Der gesamte Spielstand dieses Spiels wird aus dem Browser gelöscht – einschließlich Leveln, Punkten, Einstellungen und Einweisung. Danach beginnt Vorgang 60 wieder ganz von vorn. Das lässt sich nicht rückgängig machen.',
    deleteDataConfirm: 'JA, ALLES ENDGÜLTIG LÖSCHEN',
    deleteDataErrorKicker: 'LÖSCHUNG BLOCKIERT', deleteDataErrorTitle: 'Die Akte klemmt im Schredder',
    deleteDataErrorCopy: 'Der Browser hat das Löschen verhindert. Bitte prüfe, ob Website-Daten oder privater Modus blockiert sind.',
    deleteDataErrorButton: 'ZURÜCK ZUM SPIEL',
  },
  dialect: {
    eyebrow: 'A KLOANS ABENTEUER AUS PASSAU',
    scoreLabel: 'PUNKT', bestLabel: 'BESTE RUNDN', roundLabel: 'LEVEL', livesLabel: 'LEINEN',
    globalProgressLabel: 'PASSAU-FORTSCHRITT',
    mapKicker: 'DEI GASSI-KARTN', mapTitle: "Wo geh ma heit hi?",
    mapCopy: 'Suach da a Platzerl in Passau aus. De Abständ san geografisch skaliert.',
    mapStart: 'LEVEL STARTN →', mapResume: 'WEIDAGASSI →', mapButton: 'PASSAU-KARTN',
    settingsLabel: 'EINSTELLUNGEN', settingsKicker: 'SPIEL & ANSCHAUN', settingsTitle: 'Gassi-Zentraln',
    settingsSystemLabel: 'SYSTEM', settingsCloseLabel: 'Einstellungen zumacha',
    menuLabel: 'MENÜ', levelIntroKicker: 'KURZ D’LEIN SORTIERN', levelIntroTitle: '{place}',
    levelIntroCopy: '{description}', controlIntroHint: 'Wisch in de Richtung, wo’s hi geh soi. D’Lola draht glei mit.',
    controlMenuHint: 'Mobil wischn, am Rechner Pfeiltastn oder WASD nehma.',
    difficultyLabel: 'WIA HART?', difficultyEasy: 'Gmiatlich', difficultyNormal: 'Gassirundn', difficultyHard: 'Sakrisch',
    easyHint: '2 Katzn · 5 Leinen · 70 Guttis · lange Schnüffel-Power',
    normalHint: '3 Katzn · 3 Leinen · 110 Guttis · guads Tempo',
    hardHint: '3 sakrisch flinke Katzn · 2 Leinen · 160 Guttis',
    treatProgressLabel: 'GUTTIS EIGSAMMELT',
    languageLabel: 'SPRACH', standardButton: 'Schönes Deutsch', dialectButton: 'Niederbairisch*',
    languageJoke: "* Koa richtige Sprach – aber des sogn aa bloß Leit, de's ned vastehn.",
    flavourQuote: '„Bloß no a kloane Rundn.“', flavourByline: '— da Franz, seit 45 Minutn',
    keyHint: 'PFEILTASTN / WASD · P ZUM PAUSIEREN', mobileHint: 'WISCHN LENKT GLEI',
    mobileBackMap: 'ZUR PASSAU-KARTN', enterFullscreenLabel: 'Vollbild o', exitFullscreenLabel: 'Vollbild aus',
    routeOne: 'START', routeTwo: 'GUTTIS', routeThree: 'ZIEL', secretsLabel: 'PASSAU-GEHEIMNIS',
    guideLabel: 'GASSI-GUIDE', treatTitle: 'Gutti', treatCopy: '+10 Punkt',
    powerTitle: 'Schnüffel-Power', powerCopy: "D'Katzn gebn Fersngeld",
    catTitle: 'Nochbarskatzn', catCopy: 'Liaba Abstand hoidn', controlsLabel: 'STEUERUNG', orLabel: 'oda',
    footerPlace: 'PASSAU · STADT & FLIASS', footerTagline: "PIXEL FÜR PIXEL DURCH D'NACHT",
    saveSuccess: "IM BROWSER G'SPEICHERT", saveBlocked: 'SPEICHER IS GSPERRT',
    pause: 'Ⅱ  PAUSE', continue: '▶  WEIDA', soundOn: '♪  TON O', soundOff: '♪  TON AUS',
    startKicker: "D'ABENDRUNDN GEHT O", startTitle: "Pack ma's, Franz!",
    startCopy: "Sammel olle Guttis ei, hoid di von de Nochbarskatzn fern und bring d'Lola guad ans Ziel.",
    startButton: "AUF GEHT'S →", resumeKicker: 'DEI RUNDN IS NO DO', resumeTitle: 'Servus zruck, Franz!',
    resumeCopy: "Level {level}, {score} Punkt und {lives} {leash} san sauber im Browser g'speichert.",
    resumeButton: 'WEIDAGASSI →', leashOne: 'Leine', leashMany: 'Leinen',
    pauseKicker: 'A KLOANE VERSCHNAUFPAUSN', pauseTitle: 'Wart amoi, Lola!',
    pauseCopy: "D'Rundn is pausiert. Da Franz bind't se bloß gschwind an Schuah.", pauseButton: "WEIDA GEHT'S →",
    winKicker: 'OLLE GUTTIS SAN EIGSAMMELT', winTitle: 'Sauba, des war’s!',
    winCopy: "D'Lola is zfriedn und da Franz a bisserl miad. Des Platzerl is auf da Passau-Kartn abghakt.",
    winButton: 'ZUR PASSAU-KARTN →', overKicker: 'DE KATZN WARN HEIT GSCHWINDER', overTitle: 'Jetz geht’s hoam.',
    overCopy: "Da Franz und d'Lola ham {score} Punkt eigsammelt. Moang pack ma's wieder.", overButton: 'NO AMOI →',
    playAnnouncement: "Auf geht's mit Franz und Lola", powerAnnouncement: "Schnüffel-Power! D'Katzn gebn Fersngeld",
    eggIlz: 'Sakradi, a Eisvogl an da Ilz!', eggPark: "Ja mei, d'Lola hod ihr Lieblingsplatzerl gfundn!",
    eggBell: "Bim bam! D'Passauer Glockn läutn bloß für eich.", secretFound: 'Geheimnis entdeckt: {message}',
    missionPrefix: 'HEITIGE RUNDN', mapSelected: 'AUSGWÄHLT', mapCompleted: 'GSCHAFFT',
    mapStatsTreats: 'GUTTIS', mapStatsAttempts: 'VERSUACH', mapStatsScore: 'BESTE PUNKT',
    mapStatsStatus: 'STATUS', mapStatsOpen: 'NO OFFN', mapStatsActive: 'AKTIVE RUNDN',
    mapStatsDone: 'GSCHAFFT', mapDetailsClose: 'Ortsdetails zumacha',
    mapAggregateLevels: 'LEVEL GSCHAFFT', mapAggregateTreats: 'GUTTIS GFUNDN',
    levelScoreLabel: 'LEVEL-PUNKT', levelRemainingLabel: 'NO OFFN',
    finaleKicker: '100% PASSAU', finaleTitle: 'Ganz Passau is abgassi’d!',
    finaleCopy: "Da Franz und d'Lola ham olle neun Gassi-Platzerl erkundet. Jeds Gutti, jeda Umweg und jede Leine ham se rentiert.",
    finaleButton: 'ZUR EHRENRUNDN →',
    newGameButton: '↺ NEIA SPIELSTAND', newGameKicker: 'WIRKLI VON VORN?',
    newGameTitle: 'A frische Gassi-Kartn?',
    newGameCopy: "Punkt, Orts-Hakerl und Geheimnis werdn glöscht. Sprach, Ton und Schwierigkeit bleibn wia's san.",
    newGameConfirm: 'JA, NEI STARTN', cancelButton: 'ABBRECHN',
    deleteBrowserDataButton: '⚠ OLLE BROWSERDATEN LÖSCHN',
    deleteDataKicker: 'LETZTE SICHERHEITSABFRAG', deleteDataTitle: 'De komplette Akt vernichtn?',
    deleteDataCopy: 'Da ganze Spielstand von dem Spiel werd ausm Browser glöscht – Level, Punkt, Einstellungen und Einweisung. Danach fangt Vorgang 60 wieder ganz von vorn o. Des ko ma ned rückgängig macha.',
    deleteDataConfirm: 'JA, OIS ENDGÜLTIG LÖSCHN',
    deleteDataErrorKicker: 'LÖSCHN BLOCKIERT', deleteDataErrorTitle: 'De Akt hängt im Schredder',
    deleteDataErrorCopy: 'Da Browser hod des Löschn verhindert. Bittsche prüaf, ob Website-Daten oder da private Modus blockiert san.',
    deleteDataErrorButton: 'ZRUCK ZUM SPIEL',
  },
};

const ONBOARDING_GUIDE = {
  standard: [
    {
      kicker: 'SONDERAKTE F-60 · OFFENLEGUNG',
      title: 'Der Auftrag',
      copy: 'Der versiegelte Umschlag springt auf. Darin liegt eine Karte von Passau – und daneben wartet Lola bereits mit angelegter Leine. Zum 60. Geburtstag wurde eine ganz besondere Ehrenrunde genehmigt.',
      points: [
        'Neun Passauer Orte bilden das offizielle Einsatzgebiet.',
        'An jedem Ort müssen sämtliche Guttis ordnungsgemäß sichergestellt werden.',
        'Nachbarskatzen betrachten den Vorgang leider als ihre Zuständigkeit.',
      ],
      finePrint: 'Aktenvermerk: Lola führt die operative Leitung. Franz trägt die Leine und die Verantwortung.',
      next: 'ZUR BEDIENUNGSANWEISUNG →',
    },
    {
      kicker: 'DIENSTANWEISUNG · FORTBEWEGUNG',
      title: 'Lola gibt die Richtung vor',
      copy: 'Sobald sich die beiden in Bewegung setzen, genügt ein kurzer Richtungswunsch. Lola versteht ihn sofort – meistens sogar schneller als eine kommunale Dienststelle.',
      points: [
        'Desktop: Pfeiltasten oder W, A, S und D verwenden.',
        'Mobil: direkt auf dem Spielfeld in die gewünschte Richtung wischen.',
        'Richtungen dürfen schon kurz vor der nächsten Kreuzung vorgemerkt werden.',
      ],
      finePrint: 'P oder die Leertaste pausieren den Vorgang. Spontane Schuhbindepausen sind zulässig.',
      next: 'ZU DEN EINSATZMITTELN →',
    },
    {
      kicker: 'DIENSTANWEISUNG · EINSATZMITTEL',
      title: 'Was unterwegs wichtig wird',
      copy: 'Die Sonderstelle hat drei auffällig unbürokratische Hilfsmittel genehmigt. Das Zahnrad-Menü enthält außerdem Karte, Pause und Ton – falls die Lage eine geordnete Unterbrechung verlangt.',
      points: [
        'Gelbe Guttis zählen zum Auftrag und müssen vollständig eingesammelt werden.',
        'Die große Pfote aktiviert Schnüffel-Power und vertreibt Katzen vorübergehend.',
        'Randpfeile zeigen Katzen an, die außerhalb des sichtbaren Bereichs lauern.',
      ],
      finePrint: 'Damit ist die Einweisung abgeschlossen. Der eigentliche Vorgang beginnt auf der Passau-Karte.',
      finish: 'VORGANG 60 STARTEN →',
    },
  ],
  dialect: [
    {
      kicker: 'SONDERAKT F-60 · JETZT WERD AUFGMACHT',
      title: 'Da Auftrag',
      copy: "Da versiegelte Umschlag springt auf. Drin liegt a Kartn von Passau – und daneben wart d'Lola scho mit da Lein. Zum 60er is a ganz bsondere Ehrenrundn genehmigt worn.",
      points: [
        'Neun Passauer Platzerl san des amtliche Einsatzgebiet.',
        'An jedem Platzerl miassn olle Guttis sauber sichergstellt werdn.',
        "De Nochbarskatzn hoitn des leider aa für eahna Zuständigkeit.",
      ],
      finePrint: "Aktenvermerk: D'Lola hod d'Einsatzleitung. Da Franz hod d'Lein und d'Verantwortung.",
      next: 'ZUR BEDIENUNGSANWEISUNG →',
    },
    {
      kicker: 'DIENSTANWEISUNG · FORTBEWEGUNG',
      title: "D'Lola gibt d'Richtung vor",
      copy: "Sobald de zwoa unterwegs san, reicht a kurzer Richtungswunsch. D'Lola vasteht'n sofort – meistens schneller ois a kommunale Dienststell.",
      points: [
        'Am Rechner: Pfeiltastn oder W, A, S und D nehma.',
        'Mobil: direkt aufm Spielfeld in de gewünschte Richtung wischn.',
        'D Richtung ko scho kurz vor da nächsten Kreuzung vorgemerkt werdn.',
      ],
      finePrint: 'P oder d Leertastn pausiern den Vorgang. Schuahbindn is ausdrücklich erlaubt.',
      next: 'ZU DE EINSATZMITTEL →',
    },
    {
      kicker: 'DIENSTANWEISUNG · EINSATZMITTEL',
      title: 'Wos unterwegs wichtig werd',
      copy: 'De Sonderstell hod drei erstaunlich unbürokratische Hilfsmittel genehmigt. Im Zahnrad-Menü san außerdem Kartn, Pause und Ton – falls d Lage a gscheide Unterbrechung braucht.',
      points: [
        'De gelbn Guttis ghern zum Auftrag und miassn olle eigsammelt werdn.',
        'De große Pfotn aktiviert d Schnüffel-Power und vertreibt Katzn für a Zeitl.',
        'Randpfeile zoagn Katzn, de grad außerhalb vom sichtbaren Bereich lauern.',
      ],
      finePrint: 'Damit war d Einweisung. Da eigentliche Vorgang fangt auf da Passau-Kartn o.',
      finish: 'JETZT PACK MA VORGANG 60 →',
    },
  ],
};

const DIFFICULTIES = {
  easy: {
    playerSpeed: 5.8, catSpeed: 2.55, frightenedSpeed: 1.85, catCount: 2,
    lives: 5, powerDuration: 12, treatTarget: 70, wander: 7.2, grace: 2.2, nameKey: 'difficultyEasy', hintKey: 'easyHint',
  },
  normal: {
    playerSpeed: 5.55, catSpeed: 3.35, frightenedSpeed: 2.55, catCount: 3,
    lives: 3, powerDuration: 9, treatTarget: 110, wander: 4.2, grace: 1.6, nameKey: 'difficultyNormal', hintKey: 'normalHint',
  },
  hard: {
    playerSpeed: 5.35, catSpeed: 4.05, frightenedSpeed: 3.25, catCount: 3,
    lives: 2, powerDuration: 7, treatTarget: 160, wander: 2.1, grace: 1.1, nameKey: 'difficultyHard', hintKey: 'hardHint',
  },
};

const PASSAU_LEVELS = [
  {
    id: 'home', icon: '⌂', lat: 48.58244, lon: 13.48316, layout: 2, river: 'ILZ · GRUBWEG', home: true,
    palette: { ground: ['#20262a', '#22292d', '#1d2529', '#252b2f'], curb: '#4d5e60', walls: ['#4e4337', '#604d3b', '#454849', '#67583e'], water: '#17657a' },
    name: { standard: 'Dahoam · Am Bramerhof', dialect: 'Dahoam · Am Bramerhof' },
    description: { standard: 'Franz und Lola starten an ihrem Zuhause. Das Haus ist Herzstück und Ziel dieser Runde.', dialect: "Da Franz und d'Lola startn dahoam. S'Haus is Herzstück und Ziel von dera Rundn." },
    mission: { standard: 'Rund um das Zuhause', dialect: "Oamoi rund ums Dahoam" },
  },
  {
    id: 'hals', icon: '≋', lat: 48.588889, lon: 13.463889, layout: 0, river: 'ILZ · HALS',
    palette: { ground: ['#17262c', '#19282f', '#15242b', '#1b2a30'], curb: '#345b61', walls: ['#174150', '#194958', '#293f4b', '#3a3f48'], water: '#0a5368' },
    name: { standard: 'Hals & Ilz', dialect: 'Hals & Ilz' },
    description: { standard: 'Enge Gassen, Ilzschleife und ein Eisvogel, wenn Lola ganz genau hinsieht.', dialect: "Enge Gassn, d'Ilzschleif und a Eisvogl, wenn d'Lola sauber hischaut." },
    mission: { standard: 'Einmal um Hals', dialect: 'Oamoi um an Hals' },
  },
  {
    id: 'oberhaus', icon: '♜', lat: 48.57809, lon: 13.47035, layout: 3, river: 'DONAU · GEORGEBERG',
    palette: { ground: ['#26252a', '#29272d', '#232329', '#2d2930'], curb: '#655a5c', walls: ['#5b403c', '#744b41', '#4e3d42', '#806049'], water: '#28687f' },
    name: { standard: 'Veste Oberhaus', dialect: 'Veste Oberhaus' },
    description: { standard: 'Hoch über den Flüssen warten Burgmauern, steile Wege und besonders flinke Katzen.', dialect: 'Hoch über de Fliass wartn Burgmauern, steile Weg und sakrisch flinke Katzn.' },
    mission: { standard: 'Runde um die Veste', dialect: "A Rundn um d'Veste" },
  },
  {
    id: 'dom', icon: '✦', lat: 48.574061, lon: 13.465439, layout: 1, river: 'ALTSTADT · DOM',
    palette: { ground: ['#26282a', '#292b2c', '#242628', '#2c2c2b'], curb: '#686667', walls: ['#655344', '#7b604a', '#4e5050', '#8a7559'], water: '#287e9b' },
    name: { standard: 'Dom St. Stephan', dialect: 'Dom St. Stephan' },
    description: { standard: 'Eine verwinkelte Altstadtrunde zwischen Gassen, Plätzen und einem kleinen Glockengeheimnis.', dialect: 'A verwinkelte Altstadtrundn zwischen Gassn, Platzln und am kloana Glockngeheimnis.' },
    mission: { standard: 'Durch die Altstadt', dialect: "Durch d'Altstadt" },
  },
  {
    id: 'dreifluesseeck', icon: '≈', lat: 48.57371, lon: 13.47681, layout: 4, river: 'DONAU · INN · ILZ',
    palette: { ground: ['#14262b', '#17292d', '#122329', '#1a2d30'], curb: '#356269', walls: ['#194651', '#205666', '#29464e', '#385961'], water: '#177f8f' },
    name: { standard: 'Dreiflüsseeck', dialect: 'Dreiflüsseeck' },
    description: { standard: 'Wo Donau, Inn und Ilz zusammentreffen, wird die Gassi-Runde besonders wasserreich.', dialect: "Wo Donau, Inn und Ilz zamkemman, werd d'Gassi-Rundn bsonders wasserreich." },
    mission: { standard: 'Runde an drei Flüssen', dialect: 'Rundn an drei Fliass' },
  },
  {
    id: 'uni', icon: 'U', lat: 48.5683, lon: 13.4533, layout: 5, river: 'INN · INNSTADT',
    palette: { ground: ['#20262d', '#222a31', '#1d242b', '#252d33'], curb: '#4d606c', walls: ['#3b4855', '#485a68', '#3d4149', '#59636d'], water: '#3cae9d' },
    name: { standard: 'Universität & Inn', dialect: 'Uni & Inn' },
    description: { standard: 'Eine schnelle Runde am Innufer zwischen Campus, Promenade und neugierigen Nachbarskatzen.', dialect: "A flotte Rundn am Innufer zwischen Campus, Promenad und neugierige Nochbarskatzn." },
    mission: { standard: 'Am Inn entlang', dialect: 'Am Inn entlang' },
  },
  {
    id: 'bschuett', icon: 'S', lat: 48.580206, lon: 13.475416, layout: 6, river: 'ILZ · BSCHÜTT', markerClass: 'park', theme: 'bschuett',
    palette: { ground: ['#173129', '#19372d', '#142c25', '#1d3b30'], curb: '#4c7564', walls: ['#234b3f', '#2e5c49', '#354c43', '#426750'], water: '#14708a' },
    name: { standard: 'Bschüttpark', dialect: 'Bschüttpark' },
    description: { standard: 'Eine grüne Runde an der Ilz zwischen Betonpark, Streetball, Beachvolleyball und großen Spielflächen.', dialect: "A grüne Rundn an da Ilz zwischen Betonpark, Streetball, Beachvolleyball und vui Platz zum Austobn." },
    mission: { standard: 'Spielrunde im Bschüttpark', dialect: 'A Spielrundn im Bschüttpark' },
  },
  {
    id: 'tabakfabrik', icon: 'TF', lat: 48.5688, lon: 13.4719, layout: 7, river: 'MÜHLTAL · INNSTADT', markerClass: 'industrial', theme: 'tabakfabrik',
    palette: { ground: ['#272322', '#2d2724', '#24201f', '#302825'], curb: '#76564a', walls: ['#704336', '#834a38', '#593b36', '#925945'], water: '#37606d' },
    name: { standard: 'Tabakfabrik', dialect: 'Tabakfabrik' },
    description: { standard: 'Backstein, Proberäume und eine kleine Bühne: Passauer Subkultur in einem alten Industriegebäude.', dialect: 'Backstoa, Proberäum und a kloane Bühn: Passauer Subkultur in am oidn Industriegebäude.' },
    mission: { standard: 'Guttis zwischen Proberäumen', dialect: 'Guttis zwischen de Proberäum' },
  },
  {
    id: 'zauberberg', icon: '⚡', lat: 48.570405, lon: 13.455266, layout: 8, river: 'HAIDENHOF · LIVE-CLUB', markerClass: 'music', theme: 'zauberberg',
    palette: { ground: ['#211829', '#261b31', '#1d1625', '#2b1d35'], curb: '#704b78', walls: ['#4b285b', '#623166', '#3b2949', '#7a354e'], water: '#2e5375' },
    name: { standard: 'Zauberberg', dialect: 'Zauberberg' },
    description: { standard: 'Verstärker auf elf: Franz und Lola geraten in ein Pixelkonzert mit Rock, Punk und Metal.', dialect: "D'Verstärker auf elf: Da Franz und d'Lola landn in am Pixelkonzert mit Rock, Punk und Metal." },
    mission: { standard: 'Gassi vor der Bühne', dialect: 'Gassi vor da Bühn' },
  },
];

const MAP_BOUNDS = { minLat: 48.5645, maxLat: 48.5945, minLon: 13.447, maxLon: 13.489 };
const MAP_VIEWBOX_SIZE = 700;
const MAP_PADDING = 45;
const KM_PER_LATITUDE_DEGREE = 111.32;
const KM_PER_LONGITUDE_DEGREE = KM_PER_LATITUDE_DEGREE
  * Math.cos(((MAP_BOUNDS.minLat + MAP_BOUNDS.maxLat) / 2) * Math.PI / 180);
const MAP_WIDTH_KM = (MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon) * KM_PER_LONGITUDE_DEGREE;
const MAP_HEIGHT_KM = (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat) * KM_PER_LATITUDE_DEGREE;
const MAP_UNITS_PER_KM = (MAP_VIEWBOX_SIZE - MAP_PADDING * 2) / Math.max(MAP_WIDTH_KM, MAP_HEIGHT_KM);
const MAP_CONTENT_WIDTH = MAP_WIDTH_KM * MAP_UNITS_PER_KM;
const MAP_CONTENT_HEIGHT = MAP_HEIGHT_KM * MAP_UNITS_PER_KM;
const MAP_OFFSET_X = (MAP_VIEWBOX_SIZE - MAP_CONTENT_WIDTH) / 2;
const MAP_OFFSET_Y = (MAP_VIEWBOX_SIZE - MAP_CONTENT_HEIGHT) / 2;

const DIRECTIONS = {
  up: { x: 0, y: -1, name: 'up' },
  down: { x: 0, y: 1, name: 'down' },
  left: { x: -1, y: 0, name: 'left' },
  right: { x: 1, y: 0, name: 'right' },
  none: { x: 0, y: 0, name: 'none' },
};

const LEVEL_BLOCKS = [
  [
    [2, 2, 5, 3], [9, 2, 3, 3], [14, 2, 4, 3], [20, 2, 3, 3],
    [2, 7, 3, 4], [7, 7, 5, 2], [14, 7, 4, 2], [20, 7, 3, 4],
    [7, 11, 3, 4], [15, 11, 3, 4], [2, 13, 3, 4], [20, 13, 3, 4],
    [7, 17, 4, 2], [14, 17, 4, 2], [2, 19, 4, 4], [8, 21, 4, 2],
    [14, 21, 3, 2], [19, 19, 4, 4],
  ],
  [
    [2, 2, 3, 3], [7, 2, 4, 2], [13, 2, 4, 3], [19, 2, 4, 3],
    [2, 7, 4, 2], [8, 6, 3, 4], [14, 7, 5, 2], [21, 7, 2, 4],
    [2, 11, 3, 4], [6, 12, 3, 2], [16, 12, 3, 2], [20, 13, 3, 4],
    [6, 16, 4, 3], [12, 16, 2, 4], [16, 17, 3, 2], [2, 19, 4, 4],
    [8, 21, 3, 2], [15, 21, 3, 2], [20, 19, 3, 4],
  ],
  [
    [2, 2, 5, 3], [9, 2, 7, 3], [18, 2, 5, 3],
    [2, 7, 4, 4], [9, 6, 7, 4], [19, 7, 4, 4],
    [6, 12, 3, 2], [16, 12, 3, 2],
    [2, 15, 4, 3], [8, 16, 3, 3], [14, 16, 3, 3], [19, 15, 4, 3],
    [2, 20, 5, 3], [9, 21, 3, 2], [14, 21, 3, 2], [19, 20, 4, 3],
  ],
  [
    [2, 2, 6, 3], [10, 2, 5, 2], [18, 2, 5, 4],
    [2, 7, 3, 5], [7, 7, 5, 2], [14, 6, 3, 4], [20, 8, 3, 3],
    [6, 13, 4, 2], [15, 12, 4, 2], [2, 15, 3, 4], [21, 14, 2, 5],
    [7, 17, 5, 3], [15, 17, 4, 2], [2, 21, 4, 2], [14, 21, 3, 2], [19, 21, 4, 2],
  ],
  [
    [2, 2, 4, 4], [8, 2, 3, 2], [14, 2, 3, 2], [19, 2, 4, 4],
    [2, 8, 5, 2], [9, 6, 3, 4], [14, 6, 3, 4], [19, 8, 4, 2],
    [6, 12, 3, 2], [16, 12, 3, 2],
    [2, 15, 4, 2], [8, 16, 4, 3], [14, 16, 4, 3], [20, 15, 3, 2],
    [2, 20, 5, 3], [9, 21, 3, 2], [14, 21, 3, 2], [19, 20, 4, 3],
  ],
  [
    [2, 2, 3, 5], [7, 2, 5, 2], [14, 2, 4, 3], [20, 2, 3, 5],
    [7, 6, 3, 4], [15, 7, 3, 3], [2, 9, 3, 3], [20, 9, 3, 3],
    [6, 12, 3, 2], [16, 12, 3, 2],
    [2, 15, 3, 4], [7, 16, 4, 2], [14, 16, 4, 2], [20, 15, 3, 4],
    [2, 21, 5, 2], [9, 20, 3, 3], [14, 20, 3, 3], [19, 21, 4, 2],
  ],
  [
    [2, 2, 5, 2], [9, 2, 3, 3], [14, 2, 3, 3], [19, 2, 4, 2],
    [2, 6, 3, 5], [7, 7, 4, 2], [15, 7, 4, 2], [21, 6, 2, 5],
    [6, 12, 3, 2], [16, 12, 3, 2],
    [2, 15, 4, 2], [8, 16, 3, 3], [15, 16, 3, 3], [20, 15, 3, 2],
    [2, 20, 5, 3], [9, 21, 3, 2], [14, 21, 3, 2], [19, 20, 4, 3],
  ],
  [
    [2, 2, 4, 4], [8, 2, 3, 2], [14, 2, 3, 2], [19, 2, 4, 4],
    [2, 8, 4, 2], [9, 6, 7, 4], [19, 8, 4, 2],
    [6, 12, 3, 2], [16, 12, 3, 2],
    [2, 15, 3, 4], [7, 16, 4, 2], [14, 16, 4, 2], [20, 15, 3, 4],
    [2, 21, 5, 2], [9, 20, 3, 3], [14, 20, 3, 3], [19, 21, 4, 2],
  ],
  [
    [2, 2, 5, 3], [9, 2, 7, 2], [18, 2, 5, 3],
    [2, 7, 4, 4], [8, 5, 9, 5], [19, 7, 4, 4],
    [6, 12, 3, 2], [16, 12, 3, 2],
    [2, 15, 4, 3], [8, 16, 3, 3], [15, 16, 3, 3], [19, 15, 4, 3],
    [2, 20, 5, 3], [9, 21, 3, 2], [14, 21, 3, 2], [19, 20, 4, 3],
  ],
];

const PLAYER_START = { x: 12, y: 20 };
const POWER_PELLET_POSITIONS = [[1, 1], [23, 1], [1, 23], [23, 23]];
const CAT_STARTS = [
  { x: 11, y: 12, color: '#ff6b5f', accent: '#9e302e' },
  { x: 12, y: 12, color: '#f2a65a', accent: '#a6532c' },
  { x: 13, y: 12, color: '#b792e8', accent: '#66509d' },
];

const ui = {
  appShell: document.querySelector('.app-shell'),
  boardColumn: document.querySelector('.board-column'),
  score: document.querySelector('#score'),
  best: document.querySelector('#best'),
  level: document.querySelector('#level'),
  lives: document.querySelector('#lives'),
  globalProgress: document.querySelector('#global-progress'),
  globalProgressCopy: document.querySelector('#global-progress-copy'),
  globalProgressBar: document.querySelector('#global-progress-bar'),
  overlay: document.querySelector('#overlay'),
  overlayCelebration: document.querySelector('#overlay-celebration'),
  overlayKicker: document.querySelector('#overlay-kicker'),
  overlayTitle: document.querySelector('#overlay-title'),
  overlayCopy: document.querySelector('#overlay-copy'),
  overlayButton: document.querySelector('#overlay-button'),
  overlaySecondaryButton: document.querySelector('#overlay-secondary-button'),
  controlIntro: document.querySelector('#control-intro'),
  pauseButton: document.querySelector('#pause-button'),
  soundButton: document.querySelector('#sound-button'),
  mobileGameHeader: document.querySelector('#mobile-game-header'),
  mobileGameMenuButton: document.querySelector('#mobile-game-menu-button'),
  mobileGameLevel: document.querySelector('#mobile-game-level'),
  mobileGameLocation: document.querySelector('#mobile-game-location'),
  mapCompletedLevels: document.querySelector('#map-completed-levels'),
  mapTotalTreats: document.querySelector('#map-total-treats'),
  levelStatusScore: document.querySelector('#level-status-score'),
  levelStatusTreats: document.querySelector('#level-status-treats'),
  levelStatusRemaining: document.querySelector('#level-status-remaining'),
  levelStatusLives: document.querySelector('#level-status-lives'),
  catRadar: document.querySelector('#cat-radar'),
  levelConfetti: document.querySelector('#level-confetti'),
  mapButton: document.querySelector('#map-button'),
  mapScreen: document.querySelector('#map-screen'),
  mapCanvas: document.querySelector('#map-canvas'),
  mapSvg: document.querySelector('#passau-map'),
  mapMarkers: document.querySelector('#map-markers'),
  mapSelection: document.querySelector('#map-selection'),
  mapSelectionClose: document.querySelector('#map-selection-close'),
  mapSelectionKicker: document.querySelector('#map-selection-kicker'),
  mapSelectionTitle: document.querySelector('#map-selection-title'),
  mapSelectionCopy: document.querySelector('#map-selection-copy'),
  mapStatsTreats: document.querySelector('#map-stats-treats'),
  mapStatsAttempts: document.querySelector('#map-stats-attempts'),
  mapStatsScore: document.querySelector('#map-stats-score'),
  mapStatsStatus: document.querySelector('#map-stats-status'),
  mapStartButton: document.querySelector('#map-start-button'),
  settingsDialog: document.querySelector('#settings-dialog'),
  settingsButton: document.querySelector('#settings-open-button'),
  settingsCloseButton: document.querySelector('#settings-close-button'),
  settingsPauseButton: document.querySelector('#settings-pause-button'),
  settingsSoundButton: document.querySelector('#settings-sound-button'),
  settingsMapButton: document.querySelector('#settings-map-button'),
  locationRiver: document.querySelector('#location-river'),
  locationCoordinates: document.querySelector('#location-coordinates'),
  locationName: document.querySelector('#location-name'),
  missionLabel: document.querySelector('#mission-label'),
  missionTitle: document.querySelector('#mission-title'),
  treatProgress: document.querySelector('#treat-progress'),
  difficultyHint: document.querySelector('#difficulty-hint'),
  newGameButton: document.querySelector('#new-game-button'),
  deleteBrowserDataButton: document.querySelector('#delete-browser-data-button'),
  eggs: document.querySelector('#eggs'),
  saveStatus: document.querySelector('#save-status'),
  saveNote: document.querySelector('.save-note'),
  easterToast: document.querySelector('#easter-toast'),
  easterToastCopy: document.querySelector('#easter-toast-copy'),
  announcement: document.querySelector('#announcement'),
  onboardingDialog: document.querySelector('#onboarding-dialog'),
  onboardingPanel: document.querySelector('.onboarding-panel'),
  onboardingLoginForm: document.querySelector('#onboarding-login-form'),
  onboardingName: document.querySelector('#onboarding-name'),
  onboardingAge: document.querySelector('#onboarding-age'),
  onboardingLoginError: document.querySelector('#onboarding-login-error'),
  onboardingSetupNext: document.querySelector('#onboarding-setup-next'),
  onboardingGuideKicker: document.querySelector('#onboarding-guide-kicker'),
  onboardingGuideTitle: document.querySelector('#onboarding-guide-title'),
  onboardingGuideCopy: document.querySelector('#onboarding-guide-copy'),
  onboardingGuidePoints: document.querySelector('#onboarding-guide-points'),
  onboardingGuidePosition: document.querySelector('.onboarding-guide-position'),
  onboardingGuideBack: document.querySelector('#onboarding-guide-back'),
  onboardingGuideNext: document.querySelector('#onboarding-guide-next'),
  onboardingGuideFinePrint: document.querySelector('#onboarding-guide-fine-print'),
  onboardingFinish: document.querySelector('#onboarding-finish'),
};

const storedGame = loadGame();
const onboardingParams = new URLSearchParams(window.location.search);
const forceOnboarding = onboardingParams.get('onboarding') === '1'
  || (import.meta.env.DEV && onboardingParams.has('onboarding'));
const onboardingPreview = Boolean(storedGame && forceOnboarding);
const requiresOnboarding = !storedGame || forceOnboarding;
let grid = [];
let pellets = new Set();
let powerPellets = new Set();
let player;
let cats = [];
let state = 'ready';
let score = 0;
let best = storedGame?.best ?? loadLegacyBest();
let level = 1;
let difficulty = DIFFICULTIES[storedGame?.difficulty] ? storedGame.difficulty : 'easy';
let lives = DIFFICULTIES[difficulty].lives;
let powerTimer = 0;
let hitTimer = 0;
let graceTimer = 0;
let soundEnabled = false;
let runStarted = false;
let language = storedGame?.language === 'standard' ? 'standard' : 'dialect';
let levelTreatTotal = 0;
let selectedLevelId = PASSAU_LEVELS.some((item) => item.id === storedGame?.selectedLevelId)
  ? storedGame.selectedLevelId
  : 'home';
let mapSelectionId = selectedLevelId;
let completedLevelIds = new Set(
  Array.isArray(storedGame?.completedLevelIds)
    ? storedGame.completedLevelIds.filter((id) => PASSAU_LEVELS.some((item) => item.id === id))
    : [],
);
let levelStats = normalizeLevelStats(storedGame?.levelStats);
let levelRunScore = Math.max(0, Math.floor(Number(storedGame?.levelRunScore) || 0));
let unlockedEggs = new Set();
let activeEasterEgg = null;
let currentOverlay = null;
let directionHistory = [];
let savePulseTimer;
let audioContext;
let elapsed = 0;
let autoSaveElapsed = 0;
let swipeStart = null;
let mobileScrollPosition = 0;
let settingsReturnState = null;
let settingsReturnFocus = null;
let confettiTimer = null;
let onboardingComplete = !requiresOnboarding;
let onboardingLanguage = language;
let onboardingDifficulty = difficulty;
let onboardingLoginAttempts = 0;
let onboardingGuidePage = 0;
let activeLevelDocument = null;

function t(key, values = {}) {
  const template = TEXT[language][key] ?? TEXT.standard[key] ?? key;
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

function updateOnboardingChoices() {
  document.querySelectorAll('[data-onboarding-language]').forEach((button) => {
    const active = button.dataset.onboardingLanguage === onboardingLanguage;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('[data-onboarding-difficulty]').forEach((button) => {
    const active = button.dataset.onboardingDifficulty === onboardingDifficulty;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function showOnboardingStep(step) {
  const order = ['identity', 'setup', 'guide'];
  const titleIds = {
    identity: 'onboarding-title',
    setup: 'onboarding-setup-title',
    guide: 'onboarding-guide-title',
  };
  const activeIndex = order.indexOf(step);
  document.querySelectorAll('[data-onboarding-step]').forEach((section) => {
    section.hidden = section.dataset.onboardingStep !== step;
  });
  document.querySelectorAll('[data-onboarding-progress]').forEach((indicator, index) => {
    indicator.classList.toggle('active', index === activeIndex);
    indicator.classList.toggle('done', index < activeIndex);
  });
  ui.onboardingDialog.querySelector('.onboarding-progress')
    .setAttribute('aria-label', `Einrichtung, Schritt ${activeIndex + 1} von ${order.length}`);
  ui.onboardingPanel.setAttribute('aria-labelledby', titleIds[step]);
  requestAnimationFrame(() => {
    if (step === 'identity') ui.onboardingName.focus();
    if (step === 'setup') document.querySelector('[data-onboarding-language].active')?.focus();
    if (step === 'guide') ui.onboardingGuideNext.focus();
  });
}

function showOnboarding() {
  updateOnboardingChoices();
  showOnboardingStep('identity');
  ui.onboardingDialog.hidden = false;
  ui.onboardingDialog.inert = false;
  ui.onboardingDialog.setAttribute('aria-hidden', 'false');
  ui.appShell.inert = true;
  document.body.classList.add('onboarding-open');
}

function hideOnboarding() {
  ui.onboardingDialog.hidden = true;
  ui.onboardingDialog.inert = true;
  ui.onboardingDialog.setAttribute('aria-hidden', 'true');
  ui.appShell.inert = false;
  document.body.classList.remove('onboarding-open');
}

function validateOnboardingLogin() {
  const enteredName = ui.onboardingName.value.trim().toLocaleLowerCase('de-DE');
  const enteredAge = Number(ui.onboardingAge.value);
  const nameMatches = enteredName === 'franz';
  const ageMatches = ui.onboardingAge.value !== '' && enteredAge === 60;
  ui.onboardingName.setAttribute('aria-invalid', String(!nameMatches));
  ui.onboardingAge.setAttribute('aria-invalid', String(!ageMatches));

  if (nameMatches && ageMatches) {
    ui.onboardingLoginError.classList.add('success');
    ui.onboardingLoginError.textContent = 'Treffer. Personalakte F-60 bestätigt. Der versiegelte Umschlag wird aus dem Archiv geholt …';
    ui.onboardingLoginForm.querySelector('button[type="submit"]').disabled = true;
    setTimeout(() => {
      ui.onboardingLoginError.classList.remove('success');
      ui.onboardingLoginForm.querySelector('button[type="submit"]').disabled = false;
      showOnboardingStep('setup');
    }, 650);
    return;
  }

  onboardingLoginAttempts += 1;
  ui.onboardingLoginError.classList.remove('success');
  if (!enteredName && ui.onboardingAge.value === '') {
    ui.onboardingLoginError.textContent = 'Ganz ohne Angaben wird selbst eine Fake-Behörde misstrauisch. Name und Alter bitte!';
  } else if (!nameMatches && !ageMatches) {
    ui.onboardingLoginError.textContent = 'Kein Treffer im Sonderregister. Hinterlegt sind Franz und die Kennzahl 60.';
  } else if (!nameMatches) {
    ui.onboardingLoginError.textContent = 'Die Kennzahl passt, der Personenschlüssel nicht. Zuständig ist ausschließlich Franz.';
  } else if (enteredAge < 60) {
    ui.onboardingLoginError.textContent = 'Fast! Aber unter 60 fehlt noch die amtliche Geburtstagsreife.';
  } else {
    ui.onboardingLoginError.textContent = 'Die Akte sagt 60. Komplimente über zusätzliche Lebenserfahrung zählen leider nicht.';
  }
  if (onboardingLoginAttempts >= 3) {
    ui.onboardingLoginError.textContent += ' Inoffizieller Amtshinweis: F… wie Franz und sechzig ohne Formulargebühr.';
  }
}

function renderOnboardingGuidePage() {
  const pages = ONBOARDING_GUIDE[language] ?? ONBOARDING_GUIDE.standard;
  const page = pages[onboardingGuidePage];
  const lastPage = onboardingGuidePage === pages.length - 1;
  ui.onboardingGuideKicker.textContent = page.kicker;
  ui.onboardingGuideTitle.textContent = page.title;
  ui.onboardingGuideCopy.textContent = page.copy;
  [...ui.onboardingGuidePoints.children].forEach((item, index) => {
    item.textContent = page.points[index] ?? '';
  });
  document.querySelectorAll('[data-guide-visual]').forEach((visual, index) => {
    visual.hidden = index !== onboardingGuidePage;
  });
  [...ui.onboardingGuidePosition.children].forEach((indicator, index) => {
    indicator.classList.toggle('active', index === onboardingGuidePage);
    indicator.classList.toggle('done', index < onboardingGuidePage);
  });
  ui.onboardingGuidePosition.setAttribute(
    'aria-label',
    `Einweisung, Seite ${onboardingGuidePage + 1} von ${pages.length}`,
  );
  ui.onboardingGuideBack.hidden = onboardingGuidePage === 0;
  ui.onboardingGuideNext.hidden = lastPage;
  ui.onboardingFinish.hidden = !lastPage;
  ui.onboardingGuideNext.textContent = page.next ?? 'WEITER →';
  ui.onboardingFinish.textContent = page.finish ?? 'VORGANG 60 STARTEN →';
  ui.onboardingGuideBack.textContent = language === 'dialect' ? '← ZRUCK' : '← ZURÜCK';
  ui.onboardingGuideFinePrint.textContent = page.finePrint;
  ui.onboardingPanel.scrollTop = 0;
}

function moveOnboardingGuide(direction) {
  const pages = ONBOARDING_GUIDE[language] ?? ONBOARDING_GUIDE.standard;
  onboardingGuidePage = Math.max(0, Math.min(pages.length - 1, onboardingGuidePage + direction));
  renderOnboardingGuidePage();
  requestAnimationFrame(() => {
    if (onboardingGuidePage === pages.length - 1) ui.onboardingFinish.focus();
    else ui.onboardingGuideNext.focus();
  });
}

function prepareOnboardingGuide() {
  language = onboardingLanguage;
  difficulty = onboardingDifficulty;
  lives = difficultyConfig().lives;
  graceTimer = difficultyConfig().grace;
  levelRunScore = 0;
  rebaseLevelStatsForDifficulty();
  buildLevel();
  runStarted = false;
  applyLanguage();
  updateLocationUi();
  updateHud();
  renderPassauMap();
  onboardingGuidePage = 0;
  renderOnboardingGuidePage();
  showOnboardingStep('guide');
}

function finishOnboarding() {
  if (onboardingPreview) {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('onboarding');
    window.history.replaceState(null, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    window.location.reload();
    return;
  }
  onboardingComplete = true;
  hideOnboarding();
  saveGame();
  ui.announcement.textContent = language === 'dialect'
    ? "Servus Franz, d'Passau-Kartn is freigschoit!"
    : 'Willkommen Franz, die Passau-Karte ist freigeschaltet!';
  requestAnimationFrame(() => ui.settingsButton.focus());
}

function currentLocation() {
  return PASSAU_LEVELS.find((item) => item.id === selectedLevelId) ?? PASSAU_LEVELS[0];
}

function localized(field) {
  return field[language] ?? field.standard;
}

function difficultyConfig() {
  return DIFFICULTIES[difficulty] ?? DIFFICULTIES.easy;
}

function globalProgressPercent() {
  return Math.round((completedLevelIds.size / PASSAU_LEVELS.length) * 100);
}

function aggregateMapProgress() {
  return aggregateProgress(
    PASSAU_LEVELS.map((item) => item.id),
    completedLevelIds,
    levelStats,
  );
}

function normalizeLevelStats(rawStats = {}) {
  return Object.fromEntries(PASSAU_LEVELS.map((item) => {
    const raw = rawStats && typeof rawStats[item.id] === 'object' ? rawStats[item.id] : {};
    const completed = completedLevelIds.has(item.id) || Boolean(raw.completed);
    const inferredTotal = completed ? difficultyConfig().treatTarget : 0;
    const treatsTotal = Math.max(inferredTotal, Math.max(0, Math.floor(Number(raw.treatsTotal) || 0)));
    const bestTreats = completed ? treatsTotal : Math.min(
      treatsTotal || Number.MAX_SAFE_INTEGER,
      Math.max(0, Math.floor(Number(raw.bestTreats) || 0)),
    );
    return [item.id, {
      attempts: Math.max(completed ? 1 : 0, Math.floor(Number(raw.attempts) || 0)),
      bestTreats,
      treatsTotal,
      bestScore: Math.max(0, Math.floor(Number(raw.bestScore) || 0)),
      completed,
    }];
  }));
}

function statsForLevel(id) {
  if (!levelStats[id]) levelStats[id] = normalizeLevelStats()[id];
  return levelStats[id];
}

function updateCurrentLevelStatsSnapshot(forceCompleted = false) {
  const stats = statsForLevel(selectedLevelId);
  const remainingTreats = pellets.size;
  const collectedTreats = Math.max(0, levelTreatTotal - remainingTreats);
  stats.treatsTotal = Math.max(stats.treatsTotal, levelTreatTotal);
  stats.bestTreats = Math.max(stats.bestTreats, collectedTreats);
  stats.bestScore = Math.max(stats.bestScore, levelRunScore);
  stats.completed = stats.completed || forceCompleted || completedLevelIds.has(selectedLevelId);
  if (stats.completed && stats.treatsTotal > 0) stats.bestTreats = stats.treatsTotal;
}

function recordLevelAttempt() {
  const stats = statsForLevel(selectedLevelId);
  stats.attempts += 1;
  stats.treatsTotal = Math.max(stats.treatsTotal, levelTreatTotal);
}

function applyDifficultyUi() {
  const config = difficultyConfig();
  document.querySelectorAll('[data-difficulty]').forEach((button) => {
    const active = button.dataset.difficulty === difficulty;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  ui.difficultyHint.textContent = t(config.hintKey);
}

function createCat(index) {
  const cat = CAT_STARTS[index];
  return {
    ...cat,
    index,
    x: cat.x,
    y: cat.y,
    dir: index === 0 ? DIRECTIONS.left : index === 1 ? DIRECTIONS.up : DIRECTIONS.right,
    lastDecision: '',
    respawnTimer: index * 0.9,
  };
}

function rebaseLevelStatsForDifficulty() {
  const treatsTotal = difficultyConfig().treatTarget;
  PASSAU_LEVELS.forEach((item) => {
    const stats = statsForLevel(item.id);
    const complete = completedLevelIds.has(item.id) || stats.completed;
    stats.treatsTotal = stats.attempts > 0 || complete ? treatsTotal : 0;
    stats.bestTreats = complete ? treatsTotal : Math.min(treatsTotal, stats.bestTreats);
    stats.completed = complete;
  });
}

function setDifficulty(nextDifficulty) {
  if (!DIFFICULTIES[nextDifficulty] || nextDifficulty === difficulty) return;
  const effectiveState = state === 'menu' ? settingsReturnState : state;
  const activeRound = runStarted && ['playing', 'hit', 'paused'].includes(effectiveState);
  if (runStarted) updateCurrentLevelStatsSnapshot(state === 'won');
  difficulty = nextDifficulty;
  rebaseLevelStatsForDifficulty();
  lives = difficultyConfig().lives;
  graceTimer = difficultyConfig().grace;
  levelRunScore = 0;
  buildLevel();
  runStarted = activeRound;
  if (activeRound) {
    recordLevelAttempt();
    hitTimer = 0;
    if (state === 'menu' && settingsReturnState === 'hit') settingsReturnState = 'playing';
    else if (state === 'hit') state = 'playing';
  }
  applyDifficultyUi();
  updateLocationUi();
  updateHud();
  renderPassauMap();
  saveGame();
}

function projectPoint(lat, lon) {
  const xKm = (lon - MAP_BOUNDS.minLon) * KM_PER_LONGITUDE_DEGREE;
  const yKm = (MAP_BOUNDS.maxLat - lat) * KM_PER_LATITUDE_DEGREE;
  const x = MAP_OFFSET_X + xKm * MAP_UNITS_PER_KM;
  const y = MAP_OFFSET_Y + yKm * MAP_UNITS_PER_KM;
  return { x, y };
}

function mapPath(points) {
  return points.map(([lat, lon], index) => {
    const point = projectPoint(lat, lon);
    return `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }).join(' ');
}

function renderPassauMap() {
  const danube = mapPath([[48.5752, 13.447], [48.5750, 13.457], [48.5752, 13.467], [48.5739, 13.478], [48.5743, 13.489]]);
  const inn = mapPath([[48.5645, 13.448], [48.5675, 13.454], [48.5705, 13.463], [48.5725, 13.471], [48.5739, 13.478]]);
  const ilz = mapPath([[48.5945, 13.459], [48.5906, 13.462], [48.5870, 13.461], [48.5835, 13.466], [48.5783, 13.471], [48.5741, 13.477]]);
  const locationsById = Object.fromEntries(PASSAU_LEVELS.map((item) => [item.id, item]));
  const routeNorth = mapPath(['hals', 'home', 'bschuett', 'oberhaus', 'dom', 'dreifluesseeck']
    .map((id) => [locationsById[id].lat, locationsById[id].lon]));
  const routeSouth = mapPath(['uni', 'zauberberg', 'dom', 'tabakfabrik', 'dreifluesseeck']
    .map((id) => [locationsById[id].lat, locationsById[id].lon]));
  const scaleStartX = MAP_VIEWBOX_SIZE - MAP_PADDING - MAP_UNITS_PER_KM;
  const scaleEndX = MAP_VIEWBOX_SIZE - MAP_PADDING;
  const scaleY = MAP_VIEWBOX_SIZE - 26;
  ui.mapSvg.innerHTML = `
    <ellipse class="district" cx="350" cy="235" rx="225" ry="155"></ellipse>
    <ellipse class="district" cx="350" cy="480" rx="260" ry="140"></ellipse>
    <path class="road" d="${routeNorth}"></path>
    <path class="road" d="${routeSouth}"></path>
    <path class="river river-bank" d="${danube}"></path><path class="river danube" d="${danube}"></path>
    <path class="river river-bank" d="${inn}"></path><path class="river inn" d="${inn}"></path>
    <path class="river river-bank" d="${ilz}"></path><path class="river ilz" d="${ilz}"></path>
    <path class="river-glint river-glint-danube" d="${danube}"></path>
    <path class="river-glint river-glint-inn" d="${inn}"></path>
    <path class="river-glint river-glint-ilz" d="${ilz}"></path>
    <text class="river-label" x="120" y="432">DONAU</text>
    <text class="river-label" x="176" y="617">INN</text>
    <text class="river-label" x="290" y="88">ILZ</text>
    <g class="map-scale-svg" aria-hidden="true">
      <path d="M ${scaleStartX.toFixed(1)} ${scaleY} v -7 M ${scaleStartX.toFixed(1)} ${scaleY} H ${scaleEndX.toFixed(1)} M ${scaleEndX.toFixed(1)} ${scaleY} v -7"></path>
      <text x="${((scaleStartX + scaleEndX) / 2).toFixed(1)}" y="${scaleY - 12}">1 KM</text>
    </g>
  `;

  ui.mapMarkers.replaceChildren();
  PASSAU_LEVELS.forEach((item, index) => {
    const point = projectPoint(item.lat, item.lon);
    const markerWrap = document.createElement('div');
    const marker = document.createElement('button');
    const label = document.createElement('span');
    markerWrap.className = 'map-marker-wrap';
    markerWrap.dataset.levelId = item.id;
    markerWrap.dataset.mapX = point.x;
    markerWrap.dataset.mapY = point.y;
    markerWrap.style.setProperty('--marker-delay', `${index * -0.32}s`);
    marker.type = 'button';
    marker.className = `map-marker${item.home ? ' home' : ''}${item.markerClass ? ` ${item.markerClass}` : ''}${completedLevelIds.has(item.id) ? ' completed' : ''}`;
    marker.setAttribute('aria-label', localized(item.name));
    marker.innerHTML = `<span aria-hidden="true">${item.icon}</span>`;
    label.className = 'map-marker-label';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = localized(item.name);
    markerWrap.addEventListener('click', () => selectMapLocation(item.id));
    markerWrap.append(label, marker);
    ui.mapMarkers.append(markerWrap);
  });
  updateMapSelection();
  requestAnimationFrame(positionMapMarkers);
}

function positionMapMarkers() {
  const matrix = ui.mapSvg.getScreenCTM();
  const canvasRect = ui.mapCanvas.getBoundingClientRect();
  if (!matrix || canvasRect.width === 0 || canvasRect.height === 0) return;

  ui.mapMarkers.querySelectorAll('[data-level-id]').forEach((marker) => {
    const point = ui.mapSvg.createSVGPoint();
    point.x = Number(marker.dataset.mapX);
    point.y = Number(marker.dataset.mapY);
    const screenPoint = point.matrixTransform(matrix);
    marker.style.left = `${screenPoint.x - canvasRect.left}px`;
    marker.style.top = `${screenPoint.y - canvasRect.top}px`;
  });
}

function updateMapSelection() {
  const item = PASSAU_LEVELS.find((entry) => entry.id === mapSelectionId) ?? PASSAU_LEVELS[0];
  const index = PASSAU_LEVELS.indexOf(item) + 1;
  const complete = completedLevelIds.has(item.id);
  const resumable = item.id === selectedLevelId && runStarted && lives > 0 && pellets.size > 0;
  if (item.id === selectedLevelId && runStarted) updateCurrentLevelStatsSnapshot(complete);
  const stats = statsForLevel(item.id);
  const treatsTotal = stats.treatsTotal || difficultyConfig().treatTarget;
  ui.mapSelectionKicker.textContent = `${complete ? t('mapCompleted') : t('mapSelected')} · LEVEL ${String(index).padStart(2, '0')}`;
  ui.mapSelectionTitle.textContent = localized(item.name);
  ui.mapSelectionCopy.textContent = localized(item.description);
  ui.mapStatsTreats.textContent = `${stats.bestTreats} / ${treatsTotal}`;
  ui.mapStatsAttempts.textContent = stats.attempts.toLocaleString('de-DE');
  ui.mapStatsScore.textContent = stats.bestScore.toLocaleString('de-DE');
  ui.mapStatsStatus.textContent = complete ? t('mapStatsDone') : resumable ? t('mapStatsActive') : t('mapStatsOpen');
  ui.mapStartButton.textContent = resumable ? t('mapResume') : t('mapStart');
  ui.mapMarkers.querySelectorAll('[data-level-id]').forEach((marker) => {
    const markerButton = marker.querySelector('.map-marker');
    const markerLabel = marker.querySelector('.map-marker-label');
    markerButton.classList.toggle('selected', !ui.mapSelection.hidden && marker.dataset.levelId === item.id);
    const markerItem = PASSAU_LEVELS.find((entry) => entry.id === marker.dataset.levelId);
    markerLabel.textContent = localized(markerItem.name);
    markerButton.setAttribute('aria-label', localized(markerItem.name));
  });
}

function showMapSelection() {
  ui.mapSelection.hidden = false;
  ui.mapSelection.setAttribute('aria-hidden', 'false');
  ui.mapScreen.classList.add('map-details-open');
  requestAnimationFrame(() => ui.mapSelection.classList.add('open'));
  updateMapSelection();
  if (window.matchMedia('(max-width: 680px)').matches) {
    requestAnimationFrame(() => ui.mapSelectionClose.focus());
  }
}

function closeMapSelection(returnFocus = false) {
  const marker = ui.mapMarkers.querySelector(`[data-level-id="${mapSelectionId}"]`);
  ui.mapSelection.classList.remove('open');
  ui.mapSelection.hidden = true;
  ui.mapSelection.setAttribute('aria-hidden', 'true');
  ui.mapScreen.classList.remove('map-details-open');
  marker?.querySelector('.map-marker')?.classList.remove('selected');
  if (returnFocus) marker?.querySelector('.map-marker')?.focus();
}

function selectMapLocation(id) {
  if (!PASSAU_LEVELS.some((item) => item.id === id)) return;
  mapSelectionId = id;
  showMapSelection();
}

function updateLocationUi() {
  const item = currentLocation();
  const locationLevel = PASSAU_LEVELS.indexOf(item) + 1;
  ui.locationRiver.textContent = item.river;
  ui.locationCoordinates.textContent = `${item.lat.toFixed(3)}° N · ${item.lon.toFixed(3)}° E`;
  ui.locationName.textContent = localized(item.name).toUpperCase();
  ui.mobileGameLevel.textContent = `LEVEL ${String(locationLevel).padStart(2, '0')}`;
  ui.mobileGameLocation.textContent = localized(item.name).toUpperCase();
  ui.missionLabel.textContent = `${t('missionPrefix')} · ${String(locationLevel).padStart(2, '0')} · ${t(difficultyConfig().nameKey).toUpperCase()}`;
  ui.missionTitle.textContent = localized(item.mission);
  canvas.setAttribute('aria-label', `${localized(item.name)}: Gassi-Runde mit Franz und Lola`);
}

function applyLanguage() {
  document.documentElement.lang = language === 'dialect' ? 'bar' : 'de';
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-language]').forEach((button) => {
    const active = button.dataset.language === language;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  ui.saveStatus.textContent = t('saveSuccess');
  ui.settingsButton.setAttribute('aria-label', t('settingsLabel'));
  ui.settingsCloseButton.setAttribute('aria-label', t('settingsCloseLabel'));
  ui.mapSelectionClose.setAttribute('aria-label', t('mapDetailsClose'));
  ui.mobileGameMenuButton.setAttribute('aria-label', t('menuLabel'));
  applyDifficultyUi();
  updateLocationUi();
  setPauseButtons((state === 'menu' ? settingsReturnState : state) === 'paused');
  syncSoundButtons();
  renderPassauMap();
  if (currentOverlay) refreshOverlay();
}

function setLanguage(nextLanguage) {
  if (!TEXT[nextLanguage] || nextLanguage === language) return;
  language = nextLanguage;
  applyLanguage();
  saveGame();
}

function isMobileGameLayout() {
  return window.matchMedia(
    '(pointer: coarse), (max-width: 740px), (max-width: 900px) and (max-height: 600px) and (orientation: landscape)',
  ).matches;
}

function enterMobileGameMode() {
  document.body.classList.remove('map-active');
  const alreadyActive = document.body.classList.contains('mobile-game-active');
  if (!alreadyActive) {
    mobileScrollPosition = window.scrollY;
    document.body.style.top = `-${mobileScrollPosition}px`;
    document.body.classList.add('mobile-game-active');
  }
  resizeCanvas();
  return !alreadyActive;
}

function leaveMobileGameMode(returnToBoard = false) {
  const wasActive = document.body.classList.contains('mobile-game-active');
  document.body.classList.remove('mobile-game-active');
  document.body.style.top = '';
  resizeCanvas();

  if (wasActive) {
    requestAnimationFrame(() => {
      window.scrollTo(0, mobileScrollPosition);
      if (returnToBoard) ui.boardColumn.scrollIntoView({ block: 'start' });
    });
  }
  return wasActive;
}

function openMap() {
  leaveMobileGameMode(true);
  closeSettings(false);
  closeMapSelection(false);
  if (state === 'playing' || state === 'hit') setPauseButtons(true);
  state = 'map';
  document.body.classList.add('map-active');
  mapSelectionId = selectedLevelId;
  hideOverlay();
  ui.mapScreen.hidden = false;
  renderPassauMap();
  updateHud();
  saveGame();
}

function startMapSelection() {
  closeMapSelection(false);
  document.body.classList.remove('map-active');
  enterMobileGameMode();
  const resumable = mapSelectionId === selectedLevelId && runStarted && lives > 0 && pellets.size > 0;
  if (!resumable) {
    selectedLevelId = mapSelectionId;
    level = PASSAU_LEVELS.findIndex((item) => item.id === selectedLevelId) + 1;
    lives = difficultyConfig().lives;
    hitTimer = 0;
    buildLevel();
    levelRunScore = 0;
    recordLevelAttempt();
  }
  runStarted = true;
  state = 'intro';
  ui.mapScreen.hidden = true;
  setPauseButtons(false);
  updateLocationUi();
  updateHud();
  showLevelIntro(resumable);
  saveGame();
}

function showLevelIntro(resumable = false) {
  const item = currentLocation();
  showOverlay(
    'levelIntroKicker',
    'levelIntroTitle',
    'levelIntroCopy',
    resumable ? 'resumeButton' : 'startButton',
    () => {
      state = 'playing';
      setPauseButtons(false);
      hideOverlay();
      ui.announcement.textContent = `${t('playAnnouncement')}: ${localized(item.name)}`;
      saveGame();
    },
    () => ({ place: localized(item.name), description: localized(item.description) }),
    { variant: 'level-intro', showControls: true },
  );
  ui.controlIntro.querySelector('p').textContent = isMobileGameLayout()
    ? t('controlIntroHint')
    : t('controlMenuHint');
}

function resetGameProgress() {
  leaveMobileGameMode(true);
  document.body.classList.add('map-active');
  state = 'map';
  score = 0;
  best = 0;
  level = 1;
  lives = difficultyConfig().lives;
  powerTimer = 0;
  hitTimer = 0;
  graceTimer = difficultyConfig().grace;
  runStarted = false;
  levelTreatTotal = 0;
  levelRunScore = 0;
  selectedLevelId = 'home';
  mapSelectionId = 'home';
  completedLevelIds.clear();
  levelStats = normalizeLevelStats();
  unlockedEggs.clear();
  activeEasterEgg = null;
  directionHistory = [];
  ui.easterToast.hidden = true;
  buildLevel();
  hideOverlay();
  ui.mapScreen.hidden = false;
  setPauseButtons(false);
  updateLocationUi();
  updateHud();
  renderPassauMap();
  saveGame();
}

function showNewGameConfirmation() {
  const previous = {
    state,
    mapHidden: ui.mapScreen.hidden,
    overlay: currentOverlay ? { ...currentOverlay } : null,
  };
  if (state === 'playing' || state === 'hit') {
    state = 'paused';
    setPauseButtons(true);
  }
  const cancel = () => {
    state = previous.state === 'hit' ? 'playing' : previous.state;
    ui.mapScreen.hidden = previous.mapHidden;
    if (previous.overlay) {
      currentOverlay = previous.overlay;
      refreshOverlay();
    } else {
      hideOverlay();
    }
    setPauseButtons(state === 'paused');
  };
  showOverlay(
    'newGameKicker',
    'newGameTitle',
    'newGameCopy',
    'newGameConfirm',
    resetGameProgress,
    {},
    { variant: 'confirmation', secondaryKey: 'cancelButton', secondaryHandler: cancel },
  );
}

function deleteStoredBrowserData() {
  try {
    saveStore.remove(SAVE_KEY, LEGACY_BEST_KEY);
  } catch {
    showOverlay(
      'deleteDataErrorKicker',
      'deleteDataErrorTitle',
      'deleteDataErrorCopy',
      'deleteDataErrorButton',
      hideOverlay,
    );
    return;
  }

  onboardingComplete = false;
  const cleanUrl = new URL(window.location.href);
  cleanUrl.search = '';
  window.location.replace(`${cleanUrl.pathname}${cleanUrl.hash}`);
}

function showDeleteBrowserDataConfirmation() {
  const previous = {
    state,
    mapHidden: ui.mapScreen.hidden,
    overlay: currentOverlay ? { ...currentOverlay } : null,
  };
  if (state === 'playing' || state === 'hit') {
    state = 'paused';
    setPauseButtons(true);
  }
  const cancel = () => {
    state = previous.state === 'hit' ? 'playing' : previous.state;
    ui.mapScreen.hidden = previous.mapHidden;
    if (previous.overlay) {
      currentOverlay = previous.overlay;
      refreshOverlay();
    } else {
      hideOverlay();
    }
    setPauseButtons(state === 'paused');
  };
  showOverlay(
    'deleteDataKicker',
    'deleteDataTitle',
    'deleteDataCopy',
    'deleteDataConfirm',
    deleteStoredBrowserData,
    {},
    { variant: 'confirmation', secondaryKey: 'cancelButton', secondaryHandler: cancel },
  );
}

function loadLegacyBest() {
  return saveStore.readNumber(LEGACY_BEST_KEY, 0);
}

function migrateLegacySave(parsed) {
  const legacy = { ...parsed };
  if (parsed.version === 2) {
    legacy.language = 'dialect';
    legacy.selectedLevelId = 'hals';
    legacy.completedLevelIds = [];
  }
  if (parsed.version <= 3) {
    legacy.difficulty = 'normal';
    legacy.graceTimer = 0;
  }

  const config = DIFFICULTIES[legacy.difficulty] ?? DIFFICULTIES.normal;
  const savedPellets = Array.isArray(legacy.pellets) ? legacy.pellets : [];
  const savedPowerPellets = Array.isArray(legacy.powerPellets) ? legacy.powerPellets : [];
  const oldRemaining = savedPellets.length + savedPowerPellets.length;
  const oldTotal = Math.max(oldRemaining, Math.floor(Number(legacy.levelTreatTotal) || oldRemaining));
  const collectedPowerUps = Math.max(0, POWER_PELLET_POSITIONS.length - savedPowerPellets.length);
  const collectedGuttis = Math.max(0, oldTotal - oldRemaining - collectedPowerUps);
  const completedIds = new Set(Array.isArray(legacy.completedLevelIds) ? legacy.completedLevelIds : []);
  const legacyStats = legacy.levelStats && typeof legacy.levelStats === 'object' ? legacy.levelStats : {};
  const migratedStats = Object.fromEntries(PASSAU_LEVELS.map((item) => {
    const stats = legacyStats[item.id] && typeof legacyStats[item.id] === 'object'
      ? legacyStats[item.id]
      : {};
    const completed = completedIds.has(item.id) || Boolean(stats.completed);
    const currentLevel = item.id === legacy.selectedLevelId;
    const previousBest = Math.max(0, Math.floor(Number(stats.bestTreats) || 0));
    const adjustedBest = currentLevel
      ? Math.max(collectedGuttis, previousBest - collectedPowerUps)
      : previousBest;
    return [item.id, {
      ...stats,
      treatsTotal: stats.attempts || completed || currentLevel ? config.treatTarget : 0,
      bestTreats: completed ? config.treatTarget : Math.min(config.treatTarget, adjustedBest),
      completed,
    }];
  }));

  return {
    ...legacy,
    version: SAVE_VERSION,
    rebalanceTreats: true,
    migratedTreatsCollected: Math.min(config.treatTarget, collectedGuttis),
    levelTreatTotal: config.treatTarget,
    levelStats: migratedStats,
    levelRunScore: Math.max(0, Math.floor(Number(legacy.levelRunScore) || 0)),
  };
}

function loadGame() {
  const parsed = saveStore.readJson(SAVE_KEY);
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.version === SAVE_VERSION) return parsed;
  if ([2, 3, 4, 5].includes(parsed.version)) return migrateLegacySave(parsed);
  return null;
}

function saveGame(quiet = false) {
  if (!onboardingComplete) return;
  best = Math.max(best, score);
  if (runStarted) updateCurrentLevelStatsSnapshot(state === 'won');
  const payload = {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    mode: state === 'menu' ? settingsReturnState : state,
    runStarted,
    score,
    best,
    level,
    lives,
    powerTimer,
    hitTimer,
    graceTimer,
    soundEnabled,
    language,
    difficulty,
    levelTreatTotal,
    levelRunScore,
    levelStats,
    selectedLevelId,
    completedLevelIds: [...completedLevelIds],
    unlockedEggs: [...unlockedEggs],
    pellets: [...pellets],
    powerPellets: [...powerPellets],
    player: {
      x: player.x,
      y: player.y,
      direction: player.dir.name,
      nextDirection: player.nextDir.name,
    },
    cats: cats.map((cat) => ({
      x: cat.x,
      y: cat.y,
      direction: cat.dir.name,
      lastDecision: cat.lastDecision,
      respawnTimer: cat.respawnTimer,
    })),
  };

  try {
    saveStore.writeJson(SAVE_KEY, payload);
    saveStore.remove(LEGACY_BEST_KEY);
    ui.saveStatus.textContent = t('saveSuccess');
    if (!quiet) {
      ui.saveNote.classList.add('saved');
      clearTimeout(savePulseTimer);
      savePulseTimer = setTimeout(() => ui.saveNote.classList.remove('saved'), 550);
    }
  } catch {
    ui.saveStatus.textContent = t('saveBlocked');
  }
}

function buildLevel() {
  const location = currentLocation();
  activeLevelDocument = createLevelDocument({
    id: location.id,
    icon: location.icon,
    name: location.name,
    description: location.description,
    mission: location.mission,
    location: { latitude: location.lat, longitude: location.lon, area: location.river },
    board: {
      columns: COLS,
      rows: ROWS,
      tileSize: TILE,
      tunnelRows: [TUNNEL_ROW],
      walls: LEVEL_BLOCKS[location.layout].map(([x, y, width, height]) => ({ x, y, width, height })),
    },
    theme: {
      id: location.theme ?? 'neighborhood',
      landmark: location.home ? 'brahmahof-home' : (location.theme ?? 'dog-park'),
      palette: location.palette,
    },
    actors: { player: PLAYER_START, cats: CAT_STARTS },
    collectibles: { powerUps: POWER_PELLET_POSITIONS.map(([x, y]) => ({ x, y })) },
  });
  grid = compileWallGrid(activeLevelDocument);
  pixelRenderer.setLevel(activeLevelDocument);
  const reachable = reachableTileKeys(activeLevelDocument);
  powerPellets = new Set();
  for (const [x, y] of POWER_PELLET_POSITIONS) {
    const key = toKey(x, y);
    if (reachable.has(key)) powerPellets.add(key);
  }

  const candidates = [...reachable]
    .map((key) => ({ key, coordinates: key.split(',').map(Number) }))
    .filter(({ key, coordinates: [x, y] }) => {
      const inStartArea = x >= 10 && x <= 14 && y >= 11 && y <= 13;
      const atPlayerStart = x === PLAYER_START.x && y === PLAYER_START.y;
      const insideBoard = x > 0 && x < COLS - 1 && y > 0 && y < ROWS - 1;
      return insideBoard && !inStartArea && !atPlayerStart && !powerPellets.has(key);
    })
    .sort((a, b) => {
      const [ax, ay] = a.coordinates;
      const [bx, by] = b.coordinates;
      const seed = currentLocation().layout * 97;
      return ((ax * 137 + ay * 71 + seed) % 997) - ((bx * 137 + by * 71 + seed) % 997);
    });

  const pelletLimit = difficultyConfig().treatTarget;
  pellets = new Set(candidates.slice(0, pelletLimit).map(({ key }) => key));
  levelTreatTotal = pellets.size;

  resetActors();
}

function reachableOpenKeys() {
  const visited = new Set([toKey(PLAYER_START.x, PLAYER_START.y)]);
  const queue = [{ ...PLAYER_START }];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const direction of [DIRECTIONS.up, DIRECTIONS.down, DIRECTIONS.left, DIRECTIONS.right]) {
      let x = current.x + direction.x;
      const y = current.y + direction.y;
      if (y < 0 || y >= ROWS) continue;
      if (x < 0) x = COLS - 1;
      if (x >= COLS) x = 0;
      const key = toKey(x, y);
      if (visited.has(key) || isWall(x, y)) continue;
      visited.add(key);
      queue.push({ x, y });
    }
  }
  return visited;
}

function resetActors() {
  player = {
    x: PLAYER_START.x,
    y: PLAYER_START.y,
    dir: DIRECTIONS.left,
    nextDir: DIRECTIONS.left,
  };

  cats = Array.from({ length: difficultyConfig().catCount }, (_, index) => createCat(index));
  powerTimer = 0;
  graceTimer = difficultyConfig().grace;
}

function clampNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function restoreDirection(name, fallback = DIRECTIONS.none) {
  return DIRECTIONS[name] ?? fallback;
}

function validOpenKey(key) {
  if (typeof key !== 'string' || !/^\d{1,2},\d{1,2}$/.test(key)) return false;
  const [x, y] = key.split(',').map(Number);
  return x >= 0 && x < COLS && y >= 0 && y < ROWS && !grid[y][x];
}

function restoreGame(save) {
  best = Math.max(0, Number(save.best) || 0);
  score = Math.max(0, Number(save.score) || 0);
  language = save.language === 'standard' ? 'standard' : 'dialect';
  difficulty = DIFFICULTIES[save.difficulty] ? save.difficulty : 'normal';
  selectedLevelId = PASSAU_LEVELS.some((item) => item.id === save.selectedLevelId) ? save.selectedLevelId : 'hals';
  mapSelectionId = selectedLevelId;
  level = PASSAU_LEVELS.findIndex((item) => item.id === selectedLevelId) + 1;
  completedLevelIds = new Set(
    Array.isArray(save.completedLevelIds)
      ? save.completedLevelIds.filter((id) => PASSAU_LEVELS.some((item) => item.id === id))
      : [],
  );
  levelStats = normalizeLevelStats(save.levelStats);
  levelRunScore = Math.max(0, Math.floor(Number(save.levelRunScore) || 0));
  const savedLives = Number(save.lives);
  lives = Number.isFinite(savedLives)
    ? Math.max(0, Math.min(difficultyConfig().lives, Math.floor(savedLives)))
    : difficultyConfig().lives;
  soundEnabled = Boolean(save.soundEnabled);
  runStarted = Boolean(save.runStarted);
  unlockedEggs = new Set(
    Array.isArray(save.unlockedEggs)
      ? save.unlockedEggs.filter((id) => ['ilzvogel', 'hundewiese', 'kirchenglockn'].includes(id))
      : [],
  );

  buildLevel();
  const generatedTreatTotal = levelTreatTotal;
  if (save.rebalanceTreats) {
    const migratedCollected = Math.min(
      pellets.size,
      Math.max(0, Math.floor(Number(save.migratedTreatsCollected) || 0)),
    );
    pellets = new Set([...pellets].slice(migratedCollected));
  }
  if (!save.rebalanceTreats && Array.isArray(save.pellets)) pellets = new Set(save.pellets.filter(validOpenKey));
  if (Array.isArray(save.powerPellets)) powerPellets = new Set(save.powerPellets.filter(validOpenKey));
  const remainingTreats = pellets.size;
  levelTreatTotal = save.rebalanceTreats
    ? Math.max(generatedTreatTotal, Math.floor(Number(save.levelTreatTotal) || generatedTreatTotal))
    : Math.max(remainingTreats, Math.floor(Number(save.levelTreatTotal) || remainingTreats));
  if (runStarted) updateCurrentLevelStatsSnapshot(save.mode === 'won');

  const restoreActors = save.mode !== 'hit';
  if (restoreActors && save.player) {
    player.x = clampNumber(save.player.x, -0.55, COLS - 0.45, PLAYER_START.x);
    player.y = clampNumber(save.player.y, 0, ROWS - 1, PLAYER_START.y);
    player.dir = restoreDirection(save.player.direction, DIRECTIONS.left);
    player.nextDir = restoreDirection(save.player.nextDirection, player.dir);
  }

  if (restoreActors && Array.isArray(save.cats)) {
    cats.forEach((cat, index) => {
      const savedCat = save.cats[index];
      if (!savedCat) return;
      cat.x = clampNumber(savedCat.x, -0.55, COLS - 0.45, CAT_STARTS[index].x);
      cat.y = clampNumber(savedCat.y, 0, ROWS - 1, CAT_STARTS[index].y);
      cat.dir = restoreDirection(savedCat.direction, cat.dir);
      cat.lastDecision = typeof savedCat.lastDecision === 'string' ? savedCat.lastDecision : '';
      cat.respawnTimer = clampNumber(savedCat.respawnTimer, 0, 3, 0);
    });
  }

  powerTimer = clampNumber(save.powerTimer, 0, difficultyConfig().powerDuration, 0);
  graceTimer = clampNumber(save.graceTimer, 0, difficultyConfig().grace, 0);
  hitTimer = 0;
  applyLanguage();
  updateHud();

  if (save.mode !== 'map') enterMobileGameMode();

  if (save.mode === 'map') {
    openMap();
  } else if (save.mode === 'intro') {
    state = 'intro';
    showLevelIntro(true);
  } else if (!runStarted) {
    state = 'ready';
    showStartOverlay();
  } else if (save.mode === 'won') {
    state = 'won';
    if (globalProgressPercent() === 100) showGrandFinaleOverlay();
    else showLevelCompleteOverlay();
  } else if (save.mode === 'over' || lives <= 0) {
    state = 'over';
    showGameOverOverlay();
  } else {
    state = 'paused';
    setPauseButtons(true);
    showOverlay(
      'resumeKicker',
      'resumeTitle',
      'resumeCopy',
      'resumeButton',
      () => {
        state = 'playing';
        setPauseButtons(false);
        hideOverlay();
        saveGame();
      },
      () => ({
        level,
        score: score.toLocaleString('de-DE'),
        lives,
        leash: lives === 1 ? t('leashOne') : t('leashMany'),
      }),
    );
  }
}

function toKey(x, y) {
  return `${x},${y}`;
}

function isWall(x, y) {
  if (y < 0 || y >= ROWS) return true;
  if (x < 0 || x >= COLS) return y !== TUNNEL_ROW;
  return grid[y][x];
}

function canMove(x, y, direction) {
  if (direction.name === 'none') return false;
  return !isWall(x + direction.x, y + direction.y);
}

function applyImmediatePlayerTurn(direction) {
  if (!['ready', 'playing'].includes(state)) return;
  const currentDirection = player.dir;
  const reversing = currentDirection.name !== 'none'
    && currentDirection.x === -direction.x
    && currentDirection.y === -direction.y;
  if (reversing) {
    player.dir = direction;
    return;
  }

  const centerX = Math.round(player.x);
  const centerY = Math.round(player.y);
  if (!canMove(centerX, centerY, direction)) return;
  const distanceToTurn = currentDirection.x !== 0
    ? Math.abs(player.x - centerX)
    : Math.abs(player.y - centerY);
  if (currentDirection.name === 'none' || distanceToTurn <= PLAYER_TURN_SNAP_DISTANCE) {
    player.x = centerX;
    player.y = centerY;
    player.dir = direction;
  }
}

function setDirection(name) {
  if (!DIRECTIONS[name]) return;
  const direction = DIRECTIONS[name];
  player.nextDir = direction;
  applyImmediatePlayerTurn(direction);
  directionHistory.push(name);
  directionHistory = directionHistory.slice(-BELL_SEQUENCE.length);
  if (directionHistory.join(',') === BELL_SEQUENCE.join(',')) {
    unlockEasterEgg(
      'kirchenglockn',
      t('eggBell'),
      250,
    );
  }
  if (state === 'ready') startGame();
}

function startGame(reset = false) {
  enterMobileGameMode();
  const startsNewAttempt = reset || !runStarted;
  if (reset) {
    score = 0;
    level = PASSAU_LEVELS.findIndex((item) => item.id === selectedLevelId) + 1;
    lives = difficultyConfig().lives;
    buildLevel();
  }
  if (startsNewAttempt) {
    levelRunScore = 0;
    recordLevelAttempt();
  }
  runStarted = true;
  state = 'playing';
  ui.mapScreen.hidden = true;
  setPauseButtons(false);
  hideOverlay();
  updateHud();
  ui.announcement.textContent = t('playAnnouncement');
  saveGame();
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    setPauseButtons(true);
    showOverlay('pauseKicker', 'pauseTitle', 'pauseCopy', 'pauseButton', () => {
      state = 'playing';
      setPauseButtons(false);
      hideOverlay();
      saveGame();
    });
    saveGame();
  } else if (state === 'paused') {
    state = 'playing';
    setPauseButtons(false);
    hideOverlay();
    saveGame();
  }
}

function setPauseButtons(paused) {
  ui.pauseButton.setAttribute('aria-pressed', String(paused));
  ui.pauseButton.textContent = paused ? t('continue') : t('pause');
  syncSettingsMenu();
}

function syncSoundButtons() {
  ui.soundButton.setAttribute('aria-pressed', String(soundEnabled));
  ui.soundButton.textContent = soundEnabled ? t('soundOn') : t('soundOff');
  ui.settingsSoundButton.setAttribute('aria-pressed', String(soundEnabled));
  ui.settingsSoundButton.textContent = soundEnabled ? t('soundOn') : t('soundOff');
}

function syncSettingsMenu() {
  const effectiveState = state === 'menu' ? settingsReturnState : state;
  const canPause = ['playing', 'hit', 'paused'].includes(effectiveState);
  const paused = effectiveState === 'paused';
  ui.settingsPauseButton.disabled = !canPause;
  ui.settingsPauseButton.setAttribute('aria-pressed', String(paused));
  ui.settingsPauseButton.textContent = paused ? t('continue') : t('pause');
  ui.settingsMapButton.disabled = effectiveState === 'map';
}

function openSettings() {
  if (!ui.settingsDialog.hidden) return;
  settingsReturnFocus = document.activeElement;
  if (state !== 'map') {
    settingsReturnState = state;
    state = 'menu';
  }
  syncSettingsMenu();
  ui.settingsDialog.hidden = false;
  ui.settingsDialog.inert = false;
  ui.settingsDialog.setAttribute('aria-hidden', 'false');
  document.body.classList.add('settings-open');
  requestAnimationFrame(() => ui.settingsCloseButton.focus());
}

function closeSettings(returnFocus = true) {
  if (ui.settingsDialog.hidden) return;
  ui.settingsDialog.hidden = true;
  ui.settingsDialog.inert = true;
  ui.settingsDialog.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('settings-open');
  if (state === 'menu' && settingsReturnState) state = settingsReturnState;
  settingsReturnState = null;
  syncSettingsMenu();
  if (returnFocus) {
    const focusTarget = settingsReturnFocus?.isConnected ? settingsReturnFocus : ui.settingsButton;
    focusTarget.focus();
  }
  settingsReturnFocus = null;
}

function toggleSettingsPause() {
  if (state !== 'menu' || !['playing', 'hit', 'paused'].includes(settingsReturnState)) return;
  settingsReturnState = settingsReturnState === 'paused' ? 'playing' : 'paused';
  syncSettingsMenu();
  saveGame();
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  syncSoundButtons();
  if (soundEnabled) beep(440, 0.08, 0.035, 'square');
  saveGame();
}

function showStartOverlay() {
  setPauseButtons(false);
  showOverlay(
    'startKicker',
    'startTitle',
    'startCopy',
    'startButton',
    () => startGame(),
  );
}

function showOverlay(kickerKey, titleKey, copyKey, buttonKey, handler, values = {}, options = {}) {
  currentOverlay = { kickerKey, titleKey, copyKey, buttonKey, handler, values, options };
  refreshOverlay();
  ui.overlay.hidden = false;
  ui.overlay.inert = false;
  ui.overlay.setAttribute('aria-hidden', 'false');
  ui.overlay.classList.remove('hidden');
}

function refreshOverlay() {
  if (!currentOverlay) return;
  const { kickerKey, titleKey, copyKey, buttonKey, handler, values, options = {} } = currentOverlay;
  const resolvedValues = typeof values === 'function' ? values() : values;
  ui.overlayKicker.textContent = t(kickerKey, resolvedValues);
  ui.overlayTitle.textContent = t(titleKey, resolvedValues);
  ui.overlayCopy.textContent = t(copyKey, resolvedValues);
  ui.overlayButton.textContent = t(buttonKey, resolvedValues);
  ui.overlayButton.onclick = handler;
  ui.overlay.classList.toggle('grand-finale', options.variant === 'grand-finale');
  ui.overlay.classList.toggle('confirmation', options.variant === 'confirmation');
  ui.overlay.classList.toggle('level-intro', options.variant === 'level-intro');
  ui.overlayCelebration.hidden = options.variant !== 'grand-finale';
  ui.controlIntro.hidden = !options.showControls;
  ui.overlaySecondaryButton.hidden = !options.secondaryKey;
  ui.overlaySecondaryButton.textContent = options.secondaryKey ? t(options.secondaryKey, resolvedValues) : '';
  ui.overlaySecondaryButton.onclick = options.secondaryHandler ?? null;
}

function hideOverlay() {
  ui.overlay.classList.add('hidden');
  ui.overlay.setAttribute('aria-hidden', 'true');
  ui.overlay.inert = true;
  ui.overlay.hidden = true;
  currentOverlay = null;
}

function updateHud() {
  const remainingTreats = pellets.size;
  const collectedTreats = Math.max(0, levelTreatTotal - remainingTreats);
  const progress = levelTreatTotal > 0 ? collectedTreats / levelTreatTotal : 0;
  const globalProgress = globalProgressPercent();
  if (runStarted) updateCurrentLevelStatsSnapshot(state === 'won');
  const mapProgress = aggregateMapProgress();
  ui.score.textContent = String(score).padStart(6, '0');
  ui.best.textContent = String(Math.max(score, best)).padStart(6, '0');
  ui.level.textContent = String(level).padStart(2, '0');
  ui.lives.textContent = Array.from({ length: lives }, () => '●').join(' ');
  ui.lives.setAttribute('aria-label', `${lives} ${lives === 1 ? 'Leben' : 'Leben'}`);
  ui.treatProgress.textContent = `${collectedTreats} / ${levelTreatTotal}`;
  ui.globalProgress.textContent = `${globalProgress}%`;
  ui.globalProgressCopy.textContent = `${globalProgress}%`;
  ui.globalProgressBar.style.width = `${globalProgress}%`;
  ui.globalProgress.closest('.progress-card').classList.toggle('complete', globalProgress === 100);
  ui.globalProgressBar.closest('.global-progress-panel').classList.toggle('complete', globalProgress === 100);
  document.querySelectorAll('.route-dot').forEach((dot, index) => {
    dot.classList.toggle('active', index === 0 || progress >= index / 2);
  });
  ui.eggs.textContent = `${unlockedEggs.size} / ${EASTER_EGG_COUNT}`;
  ui.mapCompletedLevels.textContent = `${mapProgress.completedLevels} VON ${mapProgress.totalLevels}`;
  ui.mapTotalTreats.textContent = `${mapProgress.treatsFound} VON ${mapProgress.treatsTotal}`;
  ui.levelStatusScore.textContent = String(levelRunScore).padStart(6, '0');
  ui.levelStatusTreats.textContent = `${collectedTreats} / ${levelTreatTotal}`;
  ui.levelStatusRemaining.textContent = String(remainingTreats);
  ui.levelStatusLives.textContent = String(lives);
}

function unlockEasterEgg(id, message, bonus) {
  if (unlockedEggs.has(id)) return;
  unlockedEggs.add(id);
  activeEasterEgg = { id, message, timer: 4.5 };
  score += bonus;
  levelRunScore += bonus;
  ui.easterToastCopy.textContent = `${message} +${bonus}`;
  ui.easterToast.hidden = false;
  ui.announcement.textContent = t('secretFound', { message });
  beep(820, 0.12, 0.045, 'square');
  setTimeout(() => beep(1040, 0.12, 0.04, 'square'), 120);
  vibrate([20, 25, 35]);
  updateHud();
  saveGame();
}

function checkLocationEasterEggs() {
  const x = Math.round(player.x);
  const y = Math.round(player.y);
  const location = currentLocation();
  if (location.river.includes('ILZ') && y === TUNNEL_ROW && (x <= 1 || x >= COLS - 2)) {
    unlockEasterEgg('ilzvogel', t('eggIlz'), 150);
  }
  if ((location.home || location.theme === 'bschuett') && x >= 10 && x <= 14 && y >= 10 && y <= 14) {
    unlockEasterEgg('hundewiese', t('eggPark'), 100);
  }
}

function update(dt) {
  elapsed += dt;
  if (graceTimer > 0) graceTimer = Math.max(0, graceTimer - dt);
  if (activeEasterEgg) {
    activeEasterEgg.timer -= dt;
    if (activeEasterEgg.timer <= 0) {
      activeEasterEgg = null;
      ui.easterToast.hidden = true;
    }
  }
  if (state === 'hit') {
    hitTimer -= dt;
    if (hitTimer <= 0) {
      if (lives <= 0) finishGame();
      else {
        resetActors();
        state = 'playing';
      }
    }
    return;
  }

  movePlayer(dt);
  for (const cat of cats) moveCat(cat, dt);
  collectTreats();
  if (state !== 'playing') return;
  checkLocationEasterEggs();

  if (powerTimer > 0) powerTimer = Math.max(0, powerTimer - dt);
  checkCollisions();
}

function movePlayer(dt) {
  const speed = difficultyConfig().playerSpeed;
  moveGridActor(player, speed * dt, {
    decideAtCenter(actor) {
      if (canMove(actor.x, actor.y, actor.nextDir)) actor.dir = actor.nextDir;
      if (!canMove(actor.x, actor.y, actor.dir)) actor.dir = DIRECTIONS.none;
    },
    wrap: wrapActor,
  });
}

function moveCat(cat, dt) {
  if (cat.respawnTimer > 0) {
    cat.respawnTimer -= dt;
    return;
  }

  const config = difficultyConfig();
  const speed = powerTimer > 0 ? config.frightenedSpeed : config.catSpeed;
  moveGridActor(cat, speed * dt, {
    decideAtCenter(actor) {
      const key = toKey(actor.x, actor.y);
      if (actor.lastDecision !== key || !canMove(actor.x, actor.y, actor.dir)) {
        actor.dir = chooseCatDirection(actor, actor.x, actor.y);
        actor.lastDecision = key;
      }
    },
    wrap: wrapActor,
  });
}

function chooseCatDirection(cat, x, y) {
  const reverse = { x: -cat.dir.x, y: -cat.dir.y };
  let options = Object.values(DIRECTIONS).filter(
    (direction) => direction.name !== 'none' && canMove(x, y, direction),
  );
  const withoutReverse = options.filter((direction) => direction.x !== reverse.x || direction.y !== reverse.y);
  if (withoutReverse.length) options = withoutReverse;

  const ahead = cat.index === 1 ? 3 : 0;
  const target = cat.index === 2 && Math.sin(elapsed * 0.7) > 0.35
    ? { x: 22, y: 22 }
    : { x: player.x + player.dir.x * ahead, y: player.y + player.dir.y * ahead };

  return options
    .map((direction) => {
      const dx = x + direction.x - target.x;
      const dy = y + direction.y - target.y;
      const distance = dx * dx + dy * dy;
      const personality = Math.random() * (cat.index + 1) * difficultyConfig().wander;
      return { direction, score: powerTimer > 0 ? -distance + personality : distance + personality };
    })
    .sort((a, b) => a.score - b.score)[0]?.direction ?? DIRECTIONS.none;
}

function wrapActor(actor) {
  if (actor.x < -0.5) actor.x = COLS - 0.5;
  if (actor.x > COLS - 0.5) actor.x = -0.5;
}

function collectTreats() {
  const x = Math.round(player.x);
  const y = Math.round(player.y);
  const key = toKey(x, y);
  const distance = Math.hypot(player.x - x, player.y - y);
  if (distance > 0.42) return;
  let collected = false;

  if (pellets.delete(key)) {
    score += 10;
    levelRunScore += 10;
    collected = true;
    beep(520, 0.025, 0.018);
    updateHud();
  }

  if (powerPellets.delete(key)) {
    score += 50;
    levelRunScore += 50;
    collected = true;
    powerTimer = difficultyConfig().powerDuration;
    beep(250, 0.15, 0.05, 'square');
    vibrate([20, 25, 20]);
    ui.announcement.textContent = t('powerAnnouncement');
    updateHud();
  }

  if (collected) saveGame(true);
  if (pellets.size === 0 && state === 'playing') completeLevel();
}

function checkCollisions() {
  if (graceTimer > 0) return;
  for (const cat of cats) {
    if (cat.respawnTimer > 0 || Math.hypot(player.x - cat.x, player.y - cat.y) > 0.72) continue;
    if (powerTimer > 0) {
      score += 200;
      levelRunScore += 200;
      cat.x = CAT_STARTS[cat.index].x;
      cat.y = CAT_STARTS[cat.index].y;
      cat.respawnTimer = 1.6;
      cat.lastDecision = '';
      beep(740, 0.1, 0.045, 'square');
      updateHud();
      saveGame(true);
    } else {
      lives -= 1;
      state = 'hit';
      hitTimer = 1.1;
      beep(95, 0.32, 0.08, 'sawtooth');
      vibrate([70, 35, 100]);
      updateHud();
      saveGame();
      break;
    }
  }
}

function completeLevel() {
  state = 'won';
  completedLevelIds.add(selectedLevelId);
  score += 500;
  levelRunScore += 500;
  updateCurrentLevelStatsSnapshot(true);
  best = Math.max(best, score);
  updateHud();
  beep(660, 0.12, 0.055, 'square');
  setTimeout(() => beep(880, 0.18, 0.05, 'square'), 140);
  launchLevelConfetti();
  if (globalProgressPercent() === 100) showGrandFinaleOverlay();
  else showLevelCompleteOverlay();
  saveGame();
}

function showLevelCompleteOverlay() {
  showOverlay(
    'winKicker',
    'winTitle',
    'winCopy',
    'winButton',
    () => {
      openMap();
    },
  );
}

function showGrandFinaleOverlay() {
  showOverlay(
    'finaleKicker',
    'finaleTitle',
    'finaleCopy',
    'finaleButton',
    () => {
      openMap();
    },
    {},
    { variant: 'grand-finale' },
  );
}

function finishGame() {
  state = 'over';
  best = Math.max(best, score);
  updateHud();
  showGameOverOverlay();
  saveGame();
}

function showGameOverOverlay() {
  showOverlay(
    'overKicker',
    'overTitle',
    'overCopy',
    'overButton',
    () => startGame(true),
    () => ({ score: score.toLocaleString('de-DE') }),
  );
}

function beep(frequency, duration, volume, type = 'sine') {
  if (!soundEnabled) return;
  audioContext ??= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function vibrate(pattern) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

function render() {
  if (!activeLevelDocument || !player) return;
  const viewportWidth = Math.max(1, canvas.clientWidth);
  const viewportHeight = Math.max(1, canvas.clientHeight);
  const playViewport = gameplayViewport(viewportWidth, viewportHeight);
  const renderState = pixelRenderer.render({
    level: activeLevelDocument,
    player,
    cats,
    pellets,
    powerUps: powerPellets,
    elapsed,
    powerTimer,
    hitTimer: state === 'hit' ? hitTimer : 0,
    easterEggs: {
      ilzvogel: currentLocation().river.includes('ILZ') && unlockedEggs.has('ilzvogel'),
      hundewiese: (currentLocation().home || currentLocation().theme === 'bschuett') && unlockedEggs.has('hundewiese'),
      active: activeEasterEgg?.id,
    },
  }, {
    alpha: simulationLoop.interpolationAlpha,
    viewport: playViewport,
    cameraEnabled: isCameraGameView(),
  });
  canvas.dataset.playerScreenX = renderState.playerScreen.x.toFixed(1);
  canvas.dataset.playerScreenY = renderState.playerScreen.y.toFixed(1);
  canvas.dataset.playerX = player.x.toFixed(3);
  canvas.dataset.playerY = player.y.toFixed(3);
  canvas.dataset.playerDirection = player.dir.name;
  canvas.dataset.playerNextDirection = player.nextDir.name;
  canvas.dataset.gameplayTop = playViewport.y.toFixed(1);
  canvas.dataset.gameplayBottom = (playViewport.y + playViewport.height).toFixed(1);
  updateCatRadar(
    renderState.camera.source.x,
    renderState.camera.source.y,
    renderState.camera.source.width,
    renderState.camera.source.height,
    playViewport,
  );
}

function launchLevelConfetti() {
  clearTimeout(confettiTimer);
  ui.levelConfetti.replaceChildren();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const colors = ['#4ce0b3', '#f5c451', '#ff6b5f', '#55d9dd', '#f4eee0'];
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 72; index += 1) {
    const piece = document.createElement('i');
    piece.style.setProperty('--confetti-x', `${(index * 37) % 101}%`);
    piece.style.setProperty('--confetti-drift', `${((index * 29) % 170) - 85}px`);
    piece.style.setProperty('--confetti-delay', `${(index % 12) * 36}ms`);
    piece.style.setProperty('--confetti-duration', `${1500 + (index % 9) * 95}ms`);
    piece.style.setProperty('--confetti-color', colors[index % colors.length]);
    piece.style.setProperty('--confetti-turn', `${360 + (index % 5) * 180}deg`);
    fragment.append(piece);
  }
  ui.levelConfetti.append(fragment);
  ui.levelConfetti.hidden = false;
  requestAnimationFrame(() => ui.levelConfetti.classList.add('active'));
  confettiTimer = setTimeout(() => {
    ui.levelConfetti.classList.remove('active');
    ui.levelConfetti.hidden = true;
    ui.levelConfetti.replaceChildren();
  }, 2800);
}

function isCameraGameView() {
  return ui.mapScreen.hidden && state !== 'map';
}

function gameplayViewport(viewportWidth, viewportHeight) {
  if (!isCameraGameView()) return { x: 0, y: 0, width: viewportWidth, height: viewportHeight };
  const canvasRect = canvas.getBoundingClientRect();
  const blockers = [ui.mobileGameHeader, document.querySelector('#level-status')];
  const safeTop = blockers.reduce((bottom, element) => {
    if (!element || getComputedStyle(element).display === 'none') return bottom;
    const rect = element.getBoundingClientRect();
    return Math.max(bottom, rect.bottom - canvasRect.top + 8);
  }, 0);
  const y = Math.min(Math.max(0, safeTop), Math.max(0, viewportHeight - 120));
  return { x: 0, y, width: viewportWidth, height: Math.max(120, viewportHeight - y) };
}

function presentScene() {
  const viewportWidth = Math.max(1, canvas.clientWidth);
  const viewportHeight = Math.max(1, canvas.clientHeight);
  const playViewport = gameplayViewport(viewportWidth, viewportHeight);
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = BOARD_SIZE;
  let sourceHeight = BOARD_SIZE;

  if (isCameraGameView()) {
    const coverScale = Math.max(
      playViewport.width / BOARD_SIZE,
      playViewport.height / BOARD_SIZE,
    ) * CAMERA_ZOOM;
    sourceWidth = playViewport.width / coverScale;
    sourceHeight = playViewport.height / coverScale;
    const playerX = player.x * TILE + TILE / 2;
    const playerY = player.y * TILE + TILE / 2;
    sourceX = Math.max(0, Math.min(BOARD_SIZE - sourceWidth, playerX - sourceWidth / 2));
    sourceY = Math.max(0, Math.min(BOARD_SIZE - sourceHeight, playerY - sourceHeight / 2));
  }

  displayCtx.setTransform(1, 0, 0, 1, 0, 0);
  displayCtx.clearRect(0, 0, canvas.width, canvas.height);
  displayCtx.imageSmoothingEnabled = false;
  displayCtx.drawImage(
    sceneCanvas,
    sourceX * SCENE_PIXEL_RATIO,
    sourceY * SCENE_PIXEL_RATIO,
    sourceWidth * SCENE_PIXEL_RATIO,
    sourceHeight * SCENE_PIXEL_RATIO,
    playViewport.x * canvas.width / viewportWidth,
    playViewport.y * canvas.height / viewportHeight,
    playViewport.width * canvas.width / viewportWidth,
    playViewport.height * canvas.height / viewportHeight,
  );
  const playerScreenX = playViewport.x
    + ((player.x * TILE + TILE / 2 - sourceX) / sourceWidth) * playViewport.width;
  const playerScreenY = playViewport.y
    + ((player.y * TILE + TILE / 2 - sourceY) / sourceHeight) * playViewport.height;
  canvas.dataset.playerScreenX = playerScreenX.toFixed(1);
  canvas.dataset.playerScreenY = playerScreenY.toFixed(1);
  canvas.dataset.playerX = player.x.toFixed(3);
  canvas.dataset.playerY = player.y.toFixed(3);
  canvas.dataset.playerDirection = player.dir.name;
  canvas.dataset.playerNextDirection = player.nextDir.name;
  canvas.dataset.gameplayTop = playViewport.y.toFixed(1);
  canvas.dataset.gameplayBottom = (playViewport.y + playViewport.height).toFixed(1);
  updateCatRadar(sourceX, sourceY, sourceWidth, sourceHeight, playViewport);
}

function ensureCatRadarIndicators() {
  while (ui.catRadar.children.length < cats.length) {
    const indicator = document.createElement('div');
    indicator.className = 'cat-indicator';
    indicator.innerHTML = '<span class="cat-indicator-arrow" aria-hidden="true">▲</span><small></small>';
    ui.catRadar.append(indicator);
  }
  while (ui.catRadar.children.length > cats.length) ui.catRadar.lastElementChild.remove();
  return [...ui.catRadar.children];
}

function updateCatRadar(sourceX, sourceY, sourceWidth, sourceHeight, playViewport) {
  const active = isCameraGameView() && ['playing', 'hit'].includes(state) && ui.mapScreen.hidden;
  ui.catRadar.hidden = !active;
  if (!active) return;

  const indicators = ensureCatRadarIndicators();
  const centerX = playViewport.x + playViewport.width / 2;
  const centerY = playViewport.y + playViewport.height / 2;
  const horizontalInset = Math.min(28, playViewport.width * 0.08);
  const verticalInset = Math.min(26, playViewport.height * 0.1);
  const safeLeft = playViewport.x + horizontalInset;
  const safeRight = playViewport.x + playViewport.width - horizontalInset;
  const safeTop = playViewport.y + verticalInset;
  const safeBottom = playViewport.y + playViewport.height - verticalInset;
  let visibleIndicators = 0;

  cats.forEach((cat, index) => {
    const indicator = indicators[index];
    const catX = playViewport.x
      + ((cat.x * TILE + TILE / 2 - sourceX) / sourceWidth) * playViewport.width;
    const catY = playViewport.y
      + ((cat.y * TILE + TILE / 2 - sourceY) / sourceHeight) * playViewport.height;
    const onScreen = catX >= playViewport.x
      && catX <= playViewport.x + playViewport.width
      && catY >= playViewport.y
      && catY <= playViewport.y + playViewport.height;
    const hidden = onScreen || cat.respawnTimer > 0;
    indicator.hidden = hidden;
    if (hidden) return;

    const dx = catX - centerX;
    const dy = catY - centerY;
    const intersections = [];
    if (dx > 0) intersections.push((safeRight - centerX) / dx);
    if (dx < 0) intersections.push((safeLeft - centerX) / dx);
    if (dy > 0) intersections.push((safeBottom - centerY) / dy);
    if (dy < 0) intersections.push((safeTop - centerY) / dy);
    const factor = Math.min(...intersections.filter((value) => value >= 0));
    const distance = Math.max(1, Math.round(Math.hypot(player.x - cat.x, player.y - cat.y)));

    indicator.style.left = `${centerX + dx * factor}px`;
    indicator.style.top = `${centerY + dy * factor}px`;
    indicator.style.setProperty('--cat-color', cat.color);
    indicator.querySelector('.cat-indicator-arrow').style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI + 90}deg)`;
    indicator.querySelector('small').textContent = distance;
    indicator.classList.toggle('danger', distance <= 5);
    visibleIndicators += 1;
  });

  ui.catRadar.hidden = visibleIndicators === 0;
}

function drawGround() {
  ctx.fillStyle = '#0b1620';
  ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const px = x * TILE;
      const py = y * TILE;
      if (grid[y][x]) drawBuildingTile(x, y, px, py);
      else drawStreetTile(x, y, px, py);
    }
  }

  const location = currentLocation();
  if (location.theme === 'bschuett') drawBschuettPark();
  else if (location.theme === 'tabakfabrik') drawTabakfabrik();
  else if (location.theme === 'zauberberg') drawZauberbergStage();
  else drawDogPark();
  if (location.home) drawHomeLandmark();
}

function drawStreetTile(x, y, px, py) {
  const locationPalette = currentLocation().palette;
  const shade = (x * 17 + y * 11) % 4;
  ctx.fillStyle = locationPalette.ground[shade];
  ctx.fillRect(px, py, TILE, TILE);

  ctx.fillStyle = shade % 2 ? '#23333d' : '#202f38';
  if ((x * 5 + y * 7) % 3 === 0) ctx.fillRect(px + 4, py + 5, 2, 1);
  if ((x * 7 + y * 3) % 5 === 0) ctx.fillRect(px + 16, py + 17, 3, 1);

  const nextToWall = [
    [0, -1], [1, 0], [0, 1], [-1, 0],
  ];
  ctx.fillStyle = locationPalette.curb;
  for (const [dx, dy] of nextToWall) {
    if (!isWall(x + dx, y + dy)) continue;
    if (dy === -1) ctx.fillRect(px, py, TILE, 2);
    if (dy === 1) ctx.fillRect(px, py + TILE - 2, TILE, 2);
    if (dx === -1) ctx.fillRect(px, py, 2, TILE);
    if (dx === 1) ctx.fillRect(px + TILE - 2, py, 2, TILE);
  }
}

function drawBuildingTile(x, y, px, py) {
  const locationPalette = currentLocation().palette;
  const isRiverEdge = x === 0 || x === COLS - 1;
  if (isRiverEdge) {
    ctx.fillStyle = locationPalette.water;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#167b8e';
    ctx.fillRect(px + ((y * 7) % 8), py + 6, 12, 2);
    ctx.fillRect(px + ((y * 11 + 5) % 9), py + 16, 10, 2);
    return;
  }

  const palette = locationPalette.walls;
  const tone = palette[(x * 3 + y * 5 + level) % palette.length];
  ctx.fillStyle = '#0e2733';
  ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = tone;
  ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);

  ctx.fillStyle = '#48707a';
  if (!isWall(x, y - 1)) ctx.fillRect(px + 2, py, TILE - 4, 3);
  if (!isWall(x - 1, y)) ctx.fillRect(px, py + 2, 3, TILE - 4);

  if ((x * 13 + y * 7) % 9 === 0) {
    ctx.fillStyle = '#d0a94d';
    ctx.fillRect(px + 8, py + 7, 7, 6);
    ctx.fillStyle = '#725c32';
    ctx.fillRect(px + 11, py + 7, 1, 6);
  } else if ((x + y) % 4 === 0) {
    ctx.fillStyle = '#26353d';
    ctx.fillRect(px + 7, py + 8, 9, 2);
    ctx.fillRect(px + 5, py + 16, 6, 2);
  }
}

function drawDogPark() {
  for (let y = 10; y <= 14; y += 1) {
    for (let x = 10; x <= 14; x += 1) {
      if (grid[y][x]) continue;
      ctx.fillStyle = (x + y) % 2 ? '#16382f' : '#183d33';
      ctx.globalAlpha = 0.72;
      ctx.fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4);
      ctx.globalAlpha = 1;
    }
  }
  ctx.fillStyle = '#5d7c69';
  ctx.font = '7px Silkscreen, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('HUNDEWIESE', 12.5 * TILE, 10.45 * TILE);
}

function drawHomeLandmark() {
  const left = 9 * TILE;
  const top = 5.4 * TILE;
  const width = 7 * TILE;
  ctx.fillStyle = '#201b17';
  ctx.fillRect(left + 6, top + 22, width - 12, 79);
  ctx.fillStyle = '#8a6a45';
  ctx.fillRect(left + 12, top + 29, width - 24, 65);
  ctx.fillStyle = '#4f3528';
  for (let step = 0; step < 6; step += 1) {
    ctx.fillRect(left + 10 + step * 12, top + 18 - step * 3, width - 20 - step * 24, 6);
  }
  ctx.fillStyle = '#d8b85a';
  ctx.fillRect(left + 28, top + 43, 18, 15);
  ctx.fillRect(left + width - 46, top + 43, 18, 15);
  ctx.fillStyle = '#4a332b';
  ctx.fillRect(left + width / 2 - 11, top + 58, 22, 36);
  ctx.fillStyle = '#f5c451';
  ctx.fillRect(left + width / 2 + 4, top + 76, 3, 3);
  ctx.fillStyle = '#f5e7bd';
  ctx.font = '7px Silkscreen, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('FRANZ & LOLA', left + width / 2, top + 37);
  ctx.fillStyle = '#1c1714';
  ctx.fillRect(left + 2, top + 98, width - 4, 4);
}

function drawBschuettPark() {
  const left = 9.75 * TILE;
  const top = 9.7 * TILE;
  const width = 5.5 * TILE;
  const height = 5.5 * TILE;
  ctx.fillStyle = '#194b3b';
  ctx.fillRect(left, top, width, height);
  ctx.strokeStyle = '#83bfa0';
  ctx.lineWidth = 2;
  ctx.strokeRect(left + 3, top + 3, width - 6, height - 6);
  ctx.beginPath();
  ctx.moveTo(left + width / 2, top + 3);
  ctx.lineTo(left + width / 2, top + height - 3);
  ctx.stroke();

  ctx.fillStyle = '#718184';
  ctx.fillRect(left + 10, top + 24, 24, 5);
  ctx.fillRect(left + 6, top + 18, 6, 11);
  ctx.fillRect(left + 32, top + 18, 6, 11);
  ctx.fillRect(left + width - 38, top + height - 29, 24, 5);
  ctx.fillRect(left + width - 40, top + height - 29, 6, 11);
  ctx.fillRect(left + width - 16, top + height - 29, 6, 11);

  ctx.strokeStyle = '#e6d9ad';
  ctx.strokeRect(left + width - 18, top + 8, 9, 7);
  ctx.fillStyle = '#d36b47';
  ctx.fillRect(left + width - 15, top + 16, 4, 4);
  ctx.fillStyle = '#8fcfa8';
  ctx.font = '7px Silkscreen, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('BSCHÜTT · SKATE & SPIEL', left + width / 2, top - 7);
}

function drawTabakfabrik() {
  const left = 9 * TILE;
  const top = 5.25 * TILE;
  const width = 7 * TILE;
  const height = 4.9 * TILE;
  ctx.fillStyle = '#321f1b';
  ctx.fillRect(left + 3, top + 8, width - 6, height - 8);
  ctx.fillStyle = '#8a4d38';
  ctx.fillRect(left + 8, top + 17, width - 16, height - 22);
  ctx.fillStyle = '#4d2f28';
  for (let row = 0; row < 8; row += 1) {
    const offset = row % 2 ? 7 : 0;
    for (let x = left + 10 - offset; x < left + width - 10; x += 14) {
      ctx.fillRect(x, top + 20 + row * 10, 1, 8);
    }
    ctx.fillRect(left + 8, top + 29 + row * 10, width - 16, 1);
  }
  ctx.fillStyle = '#221a1a';
  ctx.fillRect(left + 20, top - 9, 18, 27);
  ctx.fillRect(left + width - 39, top - 2, 13, 20);
  ctx.fillStyle = '#e2a750';
  for (const windowX of [left + 24, left + 58, left + width - 70, left + width - 36]) {
    ctx.fillRect(windowX, top + 38, 14, 12);
  }
  ctx.fillStyle = '#171315';
  ctx.fillRect(left + width / 2 - 18, top + 64, 36, height - 69);
  ctx.fillStyle = '#f0d0a0';
  ctx.font = '7px Silkscreen, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('TABAKFABRIK', left + width / 2, top + 31);
  ctx.fillStyle = '#e07a4f';
  ctx.fillText('PROBE · BÜHNE · BAR', left + width / 2, top + height - 8);
}

function drawZauberbergStage() {
  const left = 8 * TILE;
  const top = 4.55 * TILE;
  const width = 9 * TILE;
  const height = 5.6 * TILE;
  ctx.fillStyle = '#0b0810';
  ctx.fillRect(left + 4, top + 9, width - 8, height - 9);
  ctx.fillStyle = '#34203f';
  ctx.fillRect(left + 12, top + 17, width - 24, height - 28);

  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#ff4f87';
  ctx.beginPath();
  ctx.moveTo(left + 35, top + 20);
  ctx.lineTo(left + 74, top + height + 78);
  ctx.lineTo(left + 112, top + height + 78);
  ctx.fill();
  ctx.fillStyle = '#55d9dd';
  ctx.beginPath();
  ctx.moveTo(left + width - 35, top + 20);
  ctx.lineTo(left + width - 112, top + height + 78);
  ctx.lineTo(left + width - 70, top + height + 78);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#131018';
  ctx.fillRect(left + 15, top + 43, 28, 65);
  ctx.fillRect(left + width - 43, top + 43, 28, 65);
  ctx.fillStyle = '#9d4778';
  for (const speakerX of [left + 23, left + width - 35]) {
    ctx.fillRect(speakerX, top + 54, 12, 12);
    ctx.fillRect(speakerX, top + 79, 12, 12);
  }
  ctx.fillStyle = '#17101c';
  ctx.fillRect(left + 54, top + height - 35, 31, 25);
  ctx.fillRect(left + width - 85, top + height - 35, 31, 25);
  ctx.fillStyle = '#ff5d93';
  ctx.font = '8px Silkscreen, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('⚡ ZAUBERBERG ⚡', left + width / 2, top + 34);
  ctx.fillStyle = '#f1e0b7';
  ctx.font = '7px Silkscreen, monospace';
  ctx.fillText('ROCK · PUNK · METAL', left + width / 2, top + 49);

  const bounce = Math.round(Math.sin(elapsed * 7) * 3);
  ctx.fillStyle = '#63d9d4';
  ctx.fillRect(left + width / 2 - 2, top + 68 + bounce, 4, 21);
  ctx.fillRect(left + width / 2 + 2, top + 68 + bounce, 11, 4);
  ctx.fillRect(left + width / 2 + 9, top + 71 + bounce, 4, 7);
}

function drawEasterEggs() {
  const location = currentLocation();
  if (location.river.includes('ILZ') && unlockedEggs.has('ilzvogel')) drawIlzKingfisher();
  if ((location.home || location.theme === 'bschuett') && unlockedEggs.has('hundewiese')) drawLolaPaw();
  if (['dom', 'oberhaus'].includes(location.id) && unlockedEggs.has('kirchenglockn')) drawChurchBell();
}

function drawIlzKingfisher() {
  const active = activeEasterEgg?.id === 'ilzvogel';
  const px = 9;
  const py = 6 * TILE + (active ? Math.round(Math.sin(elapsed * 10) * 3) : 0);
  ctx.fillStyle = '#082b38';
  ctx.fillRect(px - 5, py + 8, 17, 2);
  ctx.fillStyle = '#31b7cf';
  ctx.fillRect(px - 4, py - 5, 11, 11);
  ctx.fillStyle = '#176e91';
  ctx.fillRect(px - 6, py - 2, 7, 8);
  ctx.fillStyle = '#ef9146';
  ctx.fillRect(px + 1, py + 1, 8, 6);
  ctx.fillStyle = '#f1d05c';
  ctx.fillRect(px + 7, py - 3, 7, 2);
  ctx.fillStyle = '#07141b';
  ctx.fillRect(px + 5, py - 4, 2, 2);
}

function drawLolaPaw() {
  const px = 12.5 * TILE;
  const py = 12.2 * TILE;
  ctx.fillStyle = activeEasterEgg?.id === 'hundewiese' ? '#f5c451' : '#75a27c';
  ctx.globalAlpha = 0.82;
  ctx.fillRect(px - 6, py - 1, 12, 9);
  ctx.fillRect(px - 10, py - 8, 5, 5);
  ctx.fillRect(px - 3, py - 11, 5, 5);
  ctx.fillRect(px + 5, py - 8, 5, 5);
  ctx.globalAlpha = 1;
}

function drawChurchBell() {
  const px = 12.5 * TILE;
  const py = 12;
  const swing = activeEasterEgg?.id === 'kirchenglockn' ? Math.round(Math.sin(elapsed * 18) * 2) : 0;
  ctx.fillStyle = '#8f6c2e';
  ctx.fillRect(px - 5 + swing, py + 2, 10, 2);
  ctx.fillStyle = '#f5c451';
  ctx.fillRect(px - 7 + swing, py + 4, 14, 8);
  ctx.fillRect(px - 9 + swing, py + 11, 18, 3);
  ctx.fillStyle = '#fff0b0';
  ctx.fillRect(px - 3 + swing, py + 5, 3, 5);
}

function drawTreats() {
  ctx.fillStyle = '#f4c552';
  for (const key of pellets) {
    const [x, y] = key.split(',').map(Number);
    const pulse = (x + y) % 3 === 0 ? 4 : 3;
    ctx.fillRect(x * TILE + (TILE - pulse) / 2, y * TILE + (TILE - pulse) / 2, pulse, pulse);
  }

  for (const key of powerPellets) {
    const [x, y] = key.split(',').map(Number);
    const px = x * TILE + TILE / 2;
    const py = y * TILE + TILE / 2;
    const glow = 0.55 + Math.sin(elapsed * 6) * 0.18;
    ctx.fillStyle = `rgba(76, 224, 179, ${glow})`;
    ctx.fillRect(px - 4, py - 2, 8, 7);
    ctx.fillRect(px - 6, py - 6, 3, 3);
    ctx.fillRect(px - 1, py - 8, 3, 3);
    ctx.fillRect(px + 4, py - 6, 3, 3);
  }
}

function drawWalker() {
  const px = Math.round(player.x * TILE + TILE / 2);
  const py = Math.round(player.y * TILE + TILE / 2);
  const direction = player.dir.name === 'none' ? player.nextDir : player.dir;
  const dir = direction.name === 'none' ? DIRECTIONS.left : direction;
  const sideX = -dir.y;
  const sideY = dir.x;
  const dogX = Math.round(px - dir.x * 11 + sideX * 8);
  const dogY = Math.round(py - dir.y * 11 + sideY * 8);
  const blink = state === 'hit' && Math.floor(hitTimer * 10) % 2 === 0;
  if (blink) return;

  // Leash
  ctx.strokeStyle = '#e7a84c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + sideX * 3, py + sideY * 3);
  ctx.lineTo(dogX, dogY);
  ctx.stroke();

  // Franz: coat, head, white hair and beard.
  const step = Math.sin(elapsed * 14) > 0 ? 1 : -1;
  ctx.fillStyle = 'rgba(1, 5, 8, 0.42)';
  ctx.fillRect(px - 8, py + 9, 17, 4);
  ctx.fillStyle = '#13201e';
  ctx.fillRect(px - 6 + step, py + 7, 4, 6);
  ctx.fillRect(px + 2 - step, py + 7, 4, 6);
  ctx.fillStyle = '#3f7969';
  ctx.fillRect(px - 7, py - 4, 14, 13);
  ctx.fillStyle = '#2d574d';
  ctx.fillRect(px - 7, py + 3, 14, 3);
  ctx.fillStyle = '#d99a78';
  ctx.fillRect(px - 5, py - 11, 10, 9);
  ctx.fillStyle = '#f4eee0';
  ctx.fillRect(px - 6, py - 12, 3, 8);
  ctx.fillRect(px + 3, py - 12, 3, 8);
  ctx.fillRect(px - 5, py - 5, 10, 5);
  ctx.fillRect(px - 3, py, 6, 2);
  ctx.fillStyle = '#223a42';
  ctx.fillRect(px - 6, py - 14, 12, 3);
  ctx.fillRect(px - 4 + dir.x * 2, py - 15 + dir.y * 2, 9, 2);
  ctx.fillStyle = '#241b18';
  ctx.fillRect(px + dir.x * 4 - 1, py - 8 + dir.y * 2, 2, 2);

  drawDog(dogX, dogY, dir);
}

function drawDog(px, py, direction) {
  const wiggle = Math.sin(elapsed * 18) > 0 ? 1 : -1;
  ctx.fillStyle = 'rgba(1, 5, 8, 0.4)';
  ctx.fillRect(px - 7, py + 5, 14, 3);
  ctx.fillStyle = '#d8b27b';
  ctx.fillRect(px - 6, py - 3, 12, 9);
  ctx.fillStyle = '#f1d7aa';
  ctx.fillRect(px - 4 + direction.x * 5, py - 6 + direction.y * 4, 9, 8);
  ctx.fillStyle = '#a97548';
  ctx.fillRect(px - 6 + direction.x * 5, py - 5 + direction.y * 4, 3, 6);
  ctx.fillRect(px + 4 + direction.x * 4, py - 5 + direction.y * 4, 3, 6);
  ctx.fillStyle = '#2b211b';
  ctx.fillRect(px + direction.x * 8 - 1, py - 2 + direction.y * 7, 3, 3);
  ctx.fillStyle = '#d8b27b';
  ctx.fillRect(px - direction.x * 8 + wiggle * direction.y, py - direction.y * 8 + wiggle * direction.x, 4, 3);
}

function drawCat(cat) {
  if (cat.respawnTimer > 0 && Math.floor(cat.respawnTimer * 8) % 2 === 0) return;
  const px = Math.round(cat.x * TILE + TILE / 2);
  const py = Math.round(cat.y * TILE + TILE / 2);
  const frightened = powerTimer > 0;
  const color = frightened ? (powerTimer < 2 && Math.floor(powerTimer * 8) % 2 ? '#f3eee0' : '#2379a3') : cat.color;
  const accent = frightened ? '#174e77' : cat.accent;

  ctx.fillStyle = 'rgba(1, 5, 8, 0.36)';
  ctx.fillRect(px - 8, py + 8, 16, 3);
  ctx.fillStyle = color;
  ctx.fillRect(px - 8, py - 7, 16, 16);
  ctx.fillRect(px - 7, py - 11, 5, 5);
  ctx.fillRect(px + 2, py - 11, 5, 5);
  ctx.fillStyle = accent;
  ctx.fillRect(px - 6, py - 9, 2, 3);
  ctx.fillRect(px + 4, py - 9, 2, 3);
  ctx.fillStyle = '#f5f0d9';
  ctx.fillRect(px - 5, py - 3, 4, 4);
  ctx.fillRect(px + 2, py - 3, 4, 4);
  ctx.fillStyle = frightened ? '#f5f0d9' : '#17212a';
  ctx.fillRect(px - 3, py - 2, 2, 2);
  ctx.fillRect(px + 3, py - 2, 2, 2);
  ctx.fillStyle = '#2c1d23';
  ctx.fillRect(px - 1, py + 3, 3, 2);
  ctx.fillStyle = color;
  ctx.fillRect(px + 7, py + 1, 3, 7);
  ctx.fillRect(px + 8, py - 1, 5, 3);
}

function drawVignette() {
  const gradient = ctx.createRadialGradient(BOARD_SIZE / 2, BOARD_SIZE / 2, BOARD_SIZE * 0.32, BOARD_SIZE / 2, BOARD_SIZE / 2, BOARD_SIZE * 0.72);
  gradient.addColorStop(0, 'rgba(2, 8, 12, 0)');
  gradient.addColorStop(1, 'rgba(2, 8, 12, 0.28)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
}

function frame(now) {
  simulationLoop.advance(now, (dt) => {
    if (state !== 'playing' && state !== 'hit') return;
    update(dt);
    autoSaveElapsed += dt;
    if (autoSaveElapsed >= 2) { autoSaveElapsed = 0; saveGame(true); }
  });
  render();
  requestAnimationFrame(frame);
}

function resizeCanvas() {
  pixelRenderer.resize();
}

document.addEventListener('keydown', (event) => {
  if (!ui.onboardingDialog.hidden) return;
  if (!ui.settingsDialog.hidden) {
    if (event.code === 'Escape') {
      event.preventDefault();
      closeSettings();
    }
    return;
  }
  if (state === 'map' && !ui.mapSelection.hidden && event.code === 'Escape') {
    event.preventDefault();
    closeMapSelection(true);
    return;
  }
  if (import.meta.env.DEV && event.code === 'F7' && ['playing', 'hit', 'paused'].includes(state)) {
    event.preventDefault();
    state = 'paused';
    setPauseButtons(true);
    hideOverlay();
    render();
    return;
  }
  if (import.meta.env.DEV && event.code === 'F6' && ['playing', 'paused'].includes(state)) {
    event.preventDefault();
    const cameraTestPositions = [
      { x: 12, y: 20 }, { x: 1, y: 1 }, { x: 23, y: 1 },
      { x: 1, y: 23 }, { x: 23, y: 23 }, { x: 12, y: 12 },
    ];
    const nextIndex = (Number(canvas.dataset.debugCameraIndex ?? -1) + 1) % cameraTestPositions.length;
    const position = cameraTestPositions[nextIndex];
    canvas.dataset.debugCameraIndex = String(nextIndex);
    player.x = position.x;
    player.y = position.y;
    player.dir = DIRECTIONS.none;
    player.nextDir = DIRECTIONS.none;
    state = 'paused';
    setPauseButtons(true);
    hideOverlay();
    render();
    return;
  }
  const debugCompleteLevel = ['F8', 'F9'].includes(event.code) || (event.altKey && event.code === 'KeyL');
  if (import.meta.env.DEV && debugCompleteLevel && ['playing', 'paused'].includes(state)) {
    event.preventDefault();
    if (event.shiftKey || event.code === 'F9') {
      completedLevelIds = new Set(PASSAU_LEVELS
        .filter((item) => item.id !== selectedLevelId)
        .map((item) => item.id));
    }
    pellets.clear();
    powerPellets.clear();
    completeLevel();
    return;
  }
  const mapping = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };
  if (mapping[event.code]) {
    event.preventDefault();
    setDirection(mapping[event.code]);
    return;
  }
  if (event.code === 'KeyP' || event.code === 'Space') {
    event.preventDefault();
    if (state === 'ready') startGame();
    else togglePause();
  }
  if (event.code === 'Enter' && !ui.overlay.classList.contains('hidden')) ui.overlayButton.click();
});

canvas.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault();
  swipeStart = {
    x: event.clientX,
    y: event.clientY,
    pointerId: event.pointerId,
    lastDirection: null,
  };
  canvas.setPointerCapture?.(event.pointerId);
});

function processSwipePointer(event) {
  if (!swipeStart || event.pointerId !== swipeStart.pointerId) return false;
  const samples = event.getCoalescedEvents?.() ?? [];
  const point = samples.at(-1) ?? event;
  const dx = point.clientX - swipeStart.x;
  const dy = point.clientY - swipeStart.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_ACTIVATION_DISTANCE) return false;

  const direction = Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down' : 'up');
  const changedDirection = direction !== swipeStart.lastDirection;
  swipeStart.x = point.clientX;
  swipeStart.y = point.clientY;
  swipeStart.lastDirection = direction;

  if (changedDirection) {
    setDirection(direction);
    if (state === 'playing') vibrate(4);
  }
  return changedDirection;
}

canvas.addEventListener('pointermove', (event) => {
  if (!swipeStart || event.pointerId !== swipeStart.pointerId) return;
  event.preventDefault();
  processSwipePointer(event);
});

canvas.addEventListener('pointerup', (event) => {
  if (!swipeStart || event.pointerId !== swipeStart.pointerId) return;
  event.preventDefault();
  processSwipePointer(event);
  if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  swipeStart = null;
});

canvas.addEventListener('pointercancel', (event) => {
  if (swipeStart?.pointerId === event.pointerId) swipeStart = null;
});

canvas.addEventListener('lostpointercapture', (event) => {
  if (swipeStart?.pointerId === event.pointerId) swipeStart = null;
});

ui.pauseButton.addEventListener('click', togglePause);
ui.soundButton.addEventListener('click', toggleSound);
ui.settingsSoundButton.addEventListener('click', toggleSound);
ui.settingsPauseButton.addEventListener('click', toggleSettingsPause);
ui.settingsMapButton.addEventListener('click', openMap);
ui.mapButton.addEventListener('click', openMap);
ui.mobileGameMenuButton.addEventListener('click', openSettings);
ui.mapStartButton.addEventListener('click', startMapSelection);
ui.mapSelectionClose.addEventListener('click', () => closeMapSelection(true));
ui.mapCanvas.addEventListener('click', (event) => {
  if (!event.target.closest('.map-marker-wrap') && !ui.mapSelection.hidden) closeMapSelection(false);
});
ui.settingsButton.addEventListener('click', openSettings);
ui.settingsCloseButton.addEventListener('click', () => closeSettings());
ui.settingsDialog.addEventListener('click', (event) => {
  if (event.target === ui.settingsDialog) closeSettings();
});
ui.onboardingLoginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  validateOnboardingLogin();
});
document.querySelectorAll('[data-onboarding-language]').forEach((button) => {
  button.addEventListener('click', () => {
    onboardingLanguage = button.dataset.onboardingLanguage;
    updateOnboardingChoices();
  });
});
document.querySelectorAll('[data-onboarding-difficulty]').forEach((button) => {
  button.addEventListener('click', () => {
    onboardingDifficulty = button.dataset.onboardingDifficulty;
    updateOnboardingChoices();
  });
});
ui.onboardingSetupNext.addEventListener('click', prepareOnboardingGuide);
ui.onboardingGuideBack.addEventListener('click', () => moveOnboardingGuide(-1));
ui.onboardingGuideNext.addEventListener('click', () => moveOnboardingGuide(1));
ui.onboardingFinish.addEventListener('click', finishOnboarding);
ui.newGameButton.addEventListener('click', () => {
  closeSettings(false);
  showNewGameConfirmation();
});
ui.deleteBrowserDataButton.addEventListener('click', () => {
  closeSettings(false);
  showDeleteBrowserDataConfirmation();
});
document.querySelectorAll('[data-language]').forEach((button) => {
  button.addEventListener('click', () => setLanguage(button.dataset.language));
});
document.querySelectorAll('[data-difficulty]').forEach((button) => {
  button.addEventListener('click', () => setDifficulty(button.dataset.difficulty));
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause();
});

document.addEventListener('touchmove', (event) => {
  if (document.body.classList.contains('mobile-game-active')) event.preventDefault();
}, { passive: false });

window.addEventListener('resize', () => {
  resizeCanvas();
  positionMapMarkers();
});
const canvasResizeObserver = 'ResizeObserver' in window
  ? new ResizeObserver(() => resizeCanvas())
  : null;
canvasResizeObserver?.observe(canvas);
const mapResizeObserver = 'ResizeObserver' in window
  ? new ResizeObserver(() => positionMapMarkers())
  : null;
mapResizeObserver?.observe(ui.mapCanvas);
window.addEventListener('pagehide', () => saveGame(true));

if (storedGame) restoreGame(storedGame);
else {
  buildLevel();
  applyLanguage();
  updateHud();
  openMap();
}
if (requiresOnboarding) showOnboarding();
resizeCanvas();
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  window.__GASSI_DEBUG__ = () => ({
    state,
    player: { x: player.x, y: player.y, direction: player.dir.name, nextDirection: player.nextDir.name },
    treats: pellets.size,
    powerUps: powerPellets.size,
    score,
    level,
    language,
    selectedLevelId,
    completedLevelIds: [...completedLevelIds],
    globalProgress: globalProgressPercent(),
    lives,
    difficulty,
    directionHistory: [...directionHistory],
    treatsCollected: Math.max(0, levelTreatTotal - pellets.size),
    treatsTotal: levelTreatTotal,
    eggs: [...unlockedEggs],
    saved: loadGame(),
  });
  window.__GASSI_DEBUG_STEP__ = (seconds) => {
    const steps = Math.max(0, Math.round(seconds * 60));
    for (let index = 0; index < steps; index += 1) update(1 / 60);
    render();
    return window.__GASSI_DEBUG__();
  };
  window.__GASSI_DEBUG_SET_PLAYER__ = (x, y) => {
    player.x = x;
    player.y = y;
    player.dir = DIRECTIONS.none;
    player.nextDir = DIRECTIONS.none;
    checkLocationEasterEggs();
    render();
    return window.__GASSI_DEBUG__();
  };
  window.__GASSI_DEBUG_COMPLETE__ = () => {
    pellets.clear();
    powerPellets.clear();
    completeLevel();
    return window.__GASSI_DEBUG__();
  };
  window.__GASSI_DEBUG_COMPLETE_ALL__ = () => {
    completedLevelIds = new Set(PASSAU_LEVELS
      .filter((item) => item.id !== selectedLevelId)
      .map((item) => item.id));
    pellets.clear();
    powerPellets.clear();
    completeLevel();
    return window.__GASSI_DEBUG__();
  };
}
