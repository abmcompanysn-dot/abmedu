/**
 * @file Template - Gestion de Cours par Catégorie
 * @description Script Google Apps pour lire et assembler des données de cours structurées
 *              à partir de plusieurs feuilles dans un Google Sheet.
 * @version 1.0.2 (Correction TypeError setHeader et getCategoryName)
 * @author Gemini Code Assist
 */

// --- CONFIGURATION ---

// URL du script central qui gère le catalogue. Ce script l'appellera pour invalider le cache.
const CENTRAL_ADMIN_API_URL = "https://script.google.com/macros/s/AKfycbxh1olxmG44KS1Gq_RA6zviC6M1xQkIUYr_0KeAS4qNILwypNLXYNQHcqFwiP9Rg5tWFw/exec";
const ALLOWED_ORIGIN = 'https://junior-senior-gaps-killer.vercel.app'; // Domaine autorisé pour CORS

// --- GESTIONNAIRES D'ÉVÉNEMENTS (TRIGGERS) ---

/**
 * Crée un menu personnalisé à l'ouverture de la feuille de calcul.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Gestion des Cours')
      .addItem('🚀 Initialiser les feuilles de cours', 'setupCourseSheets')
      .addSeparator()
      .addItem('➕ Ajouter un Cours', 'addCourse')
      .addItem('➕ Ajouter un Module', 'addModule')
      .addItem('➕ Ajouter un Chapitre', 'addChapter')
      .addSeparator()
      .addItem('🗑️ Supprimer les données de démo', 'clearDemoData')
      .addSeparator()
      .addItem('Forcer la mise à jour du cache global', 'invalidateGlobalCache')
      .addToUi();
}

/**
 * Se déclenche automatiquement à chaque modification de la feuille.
 * Invalide le cache global pour que le front-end récupère les nouvelles données.
 */
function onEdit(e) {
  Logger.log("Modification détectée. Invalidation du cache global demandée.");
  invalidateGlobalCache();
}

// --- POINTS D'ENTRÉE DE L'API WEB (doGet, doPost, doOptions) ---

/**
 * Gère les requêtes OPTIONS pour le pré-vol CORS. Essentiel pour les requêtes POST.
 */
function doOptions(e) {
  // Répond aux requêtes de pré-vérification CORS
  return ContentService.createTextOutput()
    .setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
    .setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// --- CONFIGURATION ---
const CENTRAL_SHEET_ID = "1xcW_lPim1AvD-RWDD0FtpAMYSrWq-FSv9XGa1ys2Xv4"; // IMPORTANT: ID de la feuille centrale
const DEFAULT_IMAGE_URL = "https://i.postimg.cc/X3zY8dfN/cree-oi-un-logo-fiuturiste-de-ABMedu-un-eplatforme-de-ellernnig-la-couleur-est-le-degrader-bleu-mari.jpg";


/**
 * Point d'entrée pour les requêtes GET.
 * L'action principale est `getProducts` (conservé pour la compatibilité) qui renvoie les fiches de cours complètes.
 */
function doGet(e) {
  const origin = (e && e.headers && (e.headers.Origin || e.headers.origin)) || null;
  try {
    const action = e.parameter.action;

    if (action === 'getProducts') {
      const categoryName = getCategoryName();
      const fichesCours = getAllCoursData(categoryName);
      const responseData = { success: true, data: fichesCours };
      return createJsonResponse(responseData, origin);
    }

    return createJsonResponse({ success: false, error: "Action GET non reconnue." }, origin);
  } catch (error) {
    Logger.log("ERREUR dans doGet : " + error.toString());
    return createJsonResponse({ success: false, error: error.message }, origin);
  }
}

/**
 * Point d'entrée pour les requêtes POST. Actuellement non utilisé, mais prêt pour de futures actions.
 */
function doPost(e) {
  const origin = (e && e.headers && (e.headers.Origin || e.headers.origin)) || null;
  try {
    const request = JSON.parse(e.postData.contents);
    const { action, data } = request;

    switch (action) {
      case 'addCourseFromDashboard':
        return addCourseFromDashboard(data, origin);
      default:
        return createJsonResponse({ success: false, error: `Action POST non reconnue: ${action}` }, origin);
    }

  } catch (error) {
    Logger.log("ERREUR dans doPost : " + error.toString());
    return createJsonResponse({ success: false, error: error.message }, origin);
  }
}

// --- LOGIQUE MÉTIER : ASSEMBLAGE DES DONNÉES DE COURS ---

/**
 * Fonction principale qui orchestre la récupération et l'assemblage de toutes les données de cours.
 * @param {string} categoryName - Le nom de la catégorie (ex: "Backend").
 * @returns {Array<Object>} Un tableau de fiches de cours complètes.
 */
function getAllCoursData(categoryName) {
  Logger.log(`Début de l'assemblage pour la catégorie : ${categoryName}`);

  // 1. Lire toutes les données de toutes les feuilles en une seule fois pour l'efficacité.
  const allData = {
    cours: sheetToJSON(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(`Cours_${categoryName}`)),
    modules: sheetToJSON(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(`Modules_${categoryName}`)),
    chapitres: sheetToJSON(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(`Chapitres_${categoryName}`)),
    quizChapitres: sheetToJSON(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(`Quiz_Chapitres_${categoryName}`)),
    quizModules: sheetToJSON(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(`Quiz_Modules_${categoryName}`))
  };

  Logger.log(`Données brutes lues : ${allData.cours.length} cours, ${allData.modules.length} modules, ${allData.chapitres.length} chapitres.`);

  // 2. Pour chaque cours, générer sa fiche complète.
  const fichesCompletes = allData.cours.map(cours => generateFicheCours(cours.ID_Cours, allData));

  Logger.log("Toutes les fiches de cours ont été générées.");
  return fichesCompletes.filter(f => f !== null);
}

/**
 * Génère une fiche de cours complète et structurée pour un ID de cours donné.
 * @param {string} idCours - L'ID du cours à assembler.
 * @param {Object} allData - Un objet contenant les données de toutes les feuilles.
 * @returns {Object} La fiche de cours complète.
 */
function generateFicheCours(idCours, allData) {
  Logger.log(`Génération de la fiche pour le cours ID: ${idCours}`);

  // 1. Trouver le cours de base.
  const coursBase = allData.cours.find(c => c.ID_Cours == idCours);
  if (!coursBase) {
    Logger.log(`Cours ID: ${idCours} non trouvé.`);
    return null;
  }

  // 2. Récupérer les modules pour ce cours.
  const modulesDuCours = getModulesByCours(idCours, allData.modules);

  // 3. Pour chaque module, récupérer ses chapitres et ses quiz.
  modulesDuCours.forEach(module => {
    // Récupérer les chapitres du module
    const chapitresDuModule = getChapitresByModule(module.ID_Module, allData.chapitres);

    // Pour chaque chapitre, récupérer ses quiz
    chapitresDuModule.forEach(chapitre => {
      chapitre.quiz = getQuizByChapitre(chapitre.ID_Chapitre, allData.quizChapitres);
    });

    module.chapitres = chapitresDuModule;
    module.quiz = getQuizByModule(module.ID_Module, allData.quizModules);
  });

  // 4. Assembler la fiche finale.
  const ficheFinale = {
    ...coursBase,
    modules: modulesDuCours
  };

  logFiche(ficheFinale);
  return ficheFinale;
}

// --- FONCTIONS DE RÉCUPÉRATION DE DONNÉES (FILTRAGE) ---

function getModulesByCours(idCours, allModules) {
  return allModules.filter(m => m.ID_Cours == idCours).sort((a, b) => a.Ordre_Module - b.Ordre_Module);
}

function getChapitresByModule(idModule, allChapitres) {
  return allChapitres.filter(c => c.ID_Module == idModule).sort((a, b) => a.Ordre_Chapitre - b.Ordre_Chapitre);
}

function getQuizByChapitre(idChapitre, allQuiz) {
  return allQuiz.filter(q => q.ID_Chapitre == idChapitre);
}

function getQuizByModule(idModule, allQuiz) {
  return allQuiz.filter(q => q.ID_Module == idModule);
}

// --- FONCTIONS UTILITAIRES ---

/**
 * Renvoie uniquement le nom de la catégorie (ex: "Backend") à partir du nom de la feuille (ex: "Cours_Backend").
 */
function getCategoryName() {
  const sheetName = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].getName();
  // On retire le préfixe "Cours_" pour obtenir uniquement le nom de la catégorie
  return sheetName.replace('Cours_', '');
}

function initialiserAvecDonnéesDémos() {
  const categoryName = getCategoryName();
  seedDefaultCourseData(categoryName);
  SpreadsheetApp.getUi().alert(`Les feuilles ont été remplies avec des données d'exemple pour la catégorie "${categoryName}".`);
}
/**
 * Utilitaire pour invalider le cache global en appelant le script central.
 */
function invalidateGlobalCache() {
  // Appelle le script central pour lui dire de mettre à jour la version du cache.
  UrlFetchApp.fetch(CENTRAL_ADMIN_API_URL + "?action=invalidateCache", {
    method: 'get', muteHttpExceptions: true
  });
  Logger.log("Demande d'invalidation du cache global envoyée.");
}

/**
 * Crée une réponse JSON standard.
 * CORRECTION: Suppression des appels à setHeader qui causaient l'erreur TypeError.
 */
function createJsonResponse(data, origin) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  // La gestion CORS pour GET est assurée par la configuration du déploiement
  // et la fonction doOptions pour le pre-flight.
  return output;
}

/**
 * Utilitaire pour convertir une feuille en JSON.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - La feuille à convertir.
 * @returns {Array<Object>} Un tableau d'objets représentant les lignes.
 */
function sheetToJSON(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = data.shift();
  return data.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      if (header) {
        obj[header] = row[index];
      }
    });
    return obj;
  });
}

/**
 * Affiche une version simplifiée de la fiche de cours dans les journaux d'exécution.
 * @param {Object} fiche - La fiche de cours complète.
 */
function logFiche(fiche) {
  Logger.log(`--- FICHE COURS : ${fiche.Nom_Cours} (ID: ${fiche.ID_Cours}) ---`);
  Logger.log(`  Modules: ${fiche.modules.length}`);
  fiche.modules.forEach(m => {
    Logger.log(`    - Module: ${m.Nom_Module} (Chapitres: ${m.chapitres.length}, Quiz: ${m.quiz.length})`);
  });
  Logger.log('----------------------------------------------------');
}

/**
 * Initialise toutes les feuilles nécessaires pour la gestion des cours d'une catégorie.
 */
function setupCourseSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const response = ui.prompt('Configuration', 'Entrez le nom de la catégorie (ex: Backend, DevOps):', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK || !response.getResponseText()) {
    ui.alert('Opération annulée.');
    return;
  }
  const categoryName = response.getResponseText().trim();
  ss.rename(categoryName); // Renomme la feuille de calcul elle-même

  const sheetStructures = {
    [`Cours_${categoryName}`]: ["ID_Cours", "Nom_Cours", "Résumé", "Durée_Totale", "Niveau", "Prix", "URL_Vidéo_Intro", "Image_Couverture", "Freemium_Start", "Freemium_End", "Objectifs", "Prérequis", "Avantage_Senior", "Public_Cible", "Formateur_Nom", "Formateur_Titre", "Formateur_Bio", "Note_Moyenne", "Avis"],
    [`Modules_${categoryName}`]: ["ID_Cours", "ID_Module", "Nom_Module", "Description_Module", "Durée_Module", "Ordre_Module"],
    [`Chapitres_${categoryName}`]: ["ID_Module", "ID_Chapitre", "Nom_Chapitre", "URL_Vidéo_Chapitre", "Durée", "Ressource", "Ordre_Chapitre"],
    [`Quiz_Chapitres_${categoryName}`]: ["ID_Chapitre", "Question", "Réponse_1", "Réponse_2", "Réponse_3", "Réponse_4", "Bonne_Réponse"],
    [`Quiz_Modules_${categoryName}`]: ["ID_Module", "Question", "Réponse_1", "Réponse_2", "Réponse_3", "Réponse_4", "Bonne_Réponse"]
  };

  // Supprimer les feuilles existantes sauf la première
  const allSheets = ss.getSheets();
  for (let i = allSheets.length - 1; i > 0; i--) {
    ss.deleteSheet(allSheets[i]);
  }

  let firstSheet = true;
  for (const sheetName in sheetStructures) {
    const headers = sheetStructures[sheetName];
    let sheet;
    if (firstSheet) {
      sheet = ss.getSheets()[0];
      sheet.setName(sheetName);
      sheet.clear();
      firstSheet = false;
    } else {
      sheet = ss.insertSheet(sheetName);
    }
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }

  // CORRECTION: Appeler la fonction pour ajouter les données de démo juste après la création.
  seedDefaultCourseData(categoryName);
  ui.alert(`Structure de cours pour la catégorie "${categoryName}" initialisée et remplie avec des données de démo !`);
}

/**
 * NOUVEAU: Ajoute des données d'exemple dans les feuilles fraîchement créées.
 * @param {string} categoryName - Le nom de la catégorie pour laquelle ajouter les données.
 */
function seedDefaultCourseData(categoryName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  try {
    // Récupération des feuilles
    const coursSheet = ss.getSheetByName(`Cours_${categoryName}`);
    const modulesSheet = ss.getSheetByName(`Modules_${categoryName}`);
    const chapitresSheet = ss.getSheetByName(`Chapitres_${categoryName}`);
    const quizChapitresSheet = ss.getSheetByName(`Quiz_Chapitres_${categoryName}`);
    const quizModulesSheet = ss.getSheetByName(`Quiz_Modules_${categoryName}`);

    // --- Données d'exemple ---
    // NOUVEAU: Données de cours axées sur l'entrepreneuriat

    // Cours
    const coursData = [
      ["C-001", "Gestion du Temps pour Entrepreneurs", "Apprenez à maîtriser votre temps pour maximiser votre productivité et atteindre vos objectifs plus rapidement.", "4h 30min", "Débutant", 45000, "https://www.youtube.com/embed/example1", "https://images.pexels.com/photos/7688336/pexels-photo-7688336.jpeg?auto=compress&cs=tinysrgb&w=600", "0", "1200", "Prioriser les tâches; Éviter la procrastination; Utiliser des outils de productivité.", "Aucun prérequis.", "Doublez votre productivité en 30 jours.", "Étudiants, freelances, et jeunes entrepreneurs.", "Aïcha Diallo", "Coach en Productivité", "Le temps est votre ressource la plus précieuse. Je vous apprends à l'investir, pas à le dépenser.", "4.8", "150 Avis"],
      ["C-002", "Le Mindset de la Réussite : Penser comme un Gagnant", "Développez la force mentale, la résilience et la confiance en soi nécessaires pour surmonter tous les obstacles.", "6h 00min", "Tous niveaux", 50000, "https://www.youtube.com/embed/RcgyutgrC-4", "https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg?auto=compress&cs=tinysrgb&w=600", "0", "1200", "Développer un état d'esprit de croissance; Gérer le stress et la pression; Se fixer des objectifs ambitieux.", "Aucun prérequis.", "Votre succès commence dans votre tête.", "Toute personne souhaitant atteindre son plein potentiel.", "Moussa Traoré", "Consultant en Performance", "J'ai coaché des athlètes et des PDG. Leur secret commun ? Un mental d'acier. Je vous livre leurs techniques.", "4.9", "250 Avis"],
      ["C-003", "L'Art de la Vente : Se Vendre et Vendre ses Idées", "Que vous vendiez un produit ou vous-même en entretien, apprenez les techniques des meilleurs pour convaincre.", "5h 15min", "Intermédiaire", 55000, "https://www.youtube.com/embed/example3", "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=600", "0", "1200", "Maîtriser le pitch; Comprendre la psychologie de l'acheteur; Négocier efficacement.", "Aucun prérequis.", "Apprenez à vendre n'importe quoi à n'importe qui.", "Commerciaux, entrepreneurs, chercheurs d'emploi.", "Jean Dupont", "Directeur Commercial", "La vente n'est pas un don, c'est une science. Je vous en donne la formule.", "4.7", "180 Avis"],
      ["C-004", "Les Fondamentaux de l'Entrepreneuriat : De l'Idée au Business", "Le guide étape par étape pour transformer votre idée en une entreprise viable, même en étant étudiant.", "8h 00min", "Débutant", 65000, "https://www.youtube.com/embed/UTyO2f51jM0", "https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=600", "0", "1200", "Valider son idée de marché; Créer un business model simple; Trouver ses premiers clients.", "Aucun prérequis.", "Lancez votre premier business en 90 jours.", "Étudiants et porteurs de projet.", "Fatou N'diaye", "Serial Entrepreneure", "J'ai lancé 3 entreprises avant mes 30 ans. Ce cours est la feuille de route que j'aurais aimé avoir.", "4.9", "320 Avis"],
      ["C-005", "Négocier comme un Pro : Obtenez Toujours Plus", "Apprenez les stratégies psychologiques et les tactiques pour sortir gagnant de toutes vos négociations.", "3h 45min", "Intermédiaire", 60000, "https://www.youtube.com/embed/example5", "https://images.pexels.com/photos/1181533/pexels-photo-1181533.jpeg?auto=compress&cs=tinysrgb&w=600", "0", "1200", "Préparer une négociation; Comprendre le langage corporel; Gérer les situations de blocage.", "Aucun prérequis.", "Ne laissez plus jamais d'argent sur la table.", "Tous ceux qui veulent mieux négocier leur salaire, leurs contrats, etc.", "Carlos Gomez", "Ancien Négociateur du GIGN", "La négociation est un jeu d'échecs. Je vous apprends à avoir toujours trois coups d'avance.", "4.8", "195 Avis"],
      ["C-006", "Créer de la Valeur : Le Secret des Business Durables", "Arrêtez de penser 'argent'. Commencez à penser 'valeur' et l'argent suivra. Découvrez comment créer des offres irrésistibles.", "5h 00min", "Expert", 75000, "https://www.youtube.com/embed/videoseries?list=PLjWD3w21s25Y-6fNY4H6X6z2gA4y3a-tJ", "https://images.pexels.com/photos/3153201/pexels-photo-3153201.jpeg?auto=compress&cs=tinysrgb&w=600", "0", "1200", "Identifier un problème de niche; Construire une proposition de valeur unique; Créer une communauté engagée.", "Avoir une idée de business.", "Bâtissez une marque, pas juste un produit.", "Entrepreneurs et chefs de produit.", "Hélène Martin", "Stratège en Marque", "Les entreprises qui durent sont celles qui apportent une valeur immense. Je vous montre comment.", "4.9", "140 Avis"],
      ["C-007", "Marketing Digital pour Startups", "Découvrez comment vous faire connaître avec un petit budget grâce aux stratégies de marketing digital les plus efficaces.", "7h 30min", "Débutant", 60000, "https://www.youtube.com/embed/c3g-c1g_p-A", "https://images.pexels.com/photos/6476587/pexels-photo-6476587.jpeg?auto=compress&cs=tinysrgb&w=600", "0", "1200", "Créer du contenu viral; Maîtriser la publicité Facebook; Optimiser son SEO.", "Aucun prérequis.", "Attirez vos 1000 premiers visiteurs.", "Porteurs de projet, freelances.", "Sofia Chen", "Growth Marketer", "Le marketing n'est pas une question de budget, mais de créativité. Je vous donne mes meilleures recettes.", "4.8", "210 Avis"],
      ["C-008", "Finance pour Entrepreneurs", "Ne soyez plus intimidé par les chiffres. Apprenez à lire un bilan, créer un prévisionnel et piloter votre entreprise par la data.", "6h 45min", "Débutant", 70000, "https://www.youtube.com/embed/s94-t-iW_bA", "https://images.pexels.com/photos/7567568/pexels-photo-7567568.jpeg?auto=compress&cs=tinysrgb&w=600", "0", "1200", "Comprendre le compte de résultat; Calculer son seuil de rentabilité; Gérer sa trésorerie.", "Aucun prérequis.", "Prenez des décisions basées sur des chiffres, pas des intuitions.", "Tout entrepreneur qui veut maîtriser ses finances.", "Omar Benali", "Directeur Financier à temps partagé", "La finance est le langage du business. Je vous apprends à le parler couramment.", "4.7", "115 Avis"],
      ["C-009", "Leadership et Management d'Équipe", "Passez de 'solopreneur' à leader. Apprenez à recruter, motiver et gérer une équipe performante.", "5h 00min", "Intermédiaire", 68000, "https://www.youtube.com/embed/Z3sa_K3-5sA", "https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=600", "0", "1200", "Mener un entretien d'embauche; Donner du feedback constructif; Gérer les conflits.", "Avoir une première expérience de gestion.", "Bâtissez une culture d'entreprise forte.", "Managers, chefs de projet, fondateurs de startup.", "Kenji Tanaka", "Engineering Manager", "Une bonne équipe peut accomplir l'impossible. Je vous montre comment en construire une.", "4.9", "160 Avis"]
    ];

    // Modules
    const modulesData = [
      ["C-001", "M-001-1", "Prioriser l'Essentiel", "Apprenez à distinguer l'urgent de l'important pour vous concentrer sur ce qui compte vraiment.", "1h 30min", 1],
      ["C-001", "M-001-2", "Outils et Habitudes de Productivité", "Découvrez les outils et les routines qui décuplent votre efficacité au quotidien.", "2h 00min", 2],
      ["C-002", "M-002-1", "Développer un État d'Esprit de Croissance (Growth Mindset)", "Comprenez la différence entre un état d'esprit fixe et un état d'esprit de croissance, et comment cultiver le second.", "2h 30min", 1],
      ["C-002", "M-002-2", "Gérer l'Échec et la Pression", "Transformez l'échec en opportunité d'apprentissage et gérez le stress des grands enjeux.", "2h 30min", 2],
      ["C-003", "M-003-1", "Le Pitch Parfait", "Structurez un discours percutant pour convaincre en moins de 2 minutes.", "2h 00min", 1],
      ["C-004", "M-004-1", "De l'Idée au Business Model Canvas", "Formalisez votre idée et testez sa viabilité avec des outils simples et puissants.", "3h 00min", 1],
      ["C-007", "M-007-1", "Construire sa Présence en Ligne", "Les fondations indispensables pour exister sur internet.", "2h 30min", 1],
      ["C-007", "M-007-2", "Stratégies d'Acquisition Payantes", "Comment utiliser la publicité pour accélérer sa croissance.", "3h 00min", 2],
      ["C-008", "M-008-1", "Les Documents Financiers Clés", "Apprenez à lire et comprendre les documents qui pilotent votre entreprise.", "3h 00min", 1],
      ["C-009", "M-009-1", "Recruter les Meilleurs Talents", "Les techniques pour attirer et sélectionner les profils qui feront la différence.", "2h 00min", 1]
    ];

    // Chapitres
    const chapitresData = [
      ["M-001-1", "CH-001-1-1", "La Matrice d'Eisenhower : Urgent vs Important", "https://www.youtube.com/embed/example1", "25min", "PDF: Matrice à imprimer", 1],
      ["M-001-1", "CH-001-1-2", "La loi de Pareto (80/20) appliquée à vos tâches", "https://www.youtube.com/embed/example1", "30min", "Exercice pratique", 2],
      ["M-001-2", "CH-001-2-1", "La méthode Pomodoro pour une concentration absolue", "https://www.youtube.com/embed/example1", "20min", "Quiz d'évaluation", 3],
      ["M-002-1", "CH-002-1-1", "Introduction : Fixed vs Growth Mindset", "https://www.youtube.com/embed/RcgyutgrC-4", "30min", "Auto-évaluation", 1],
      ["M-002-1", "CH-002-1-2", "Comment transformer les critiques en carburant", "https://www.youtube.com/embed/RcgyutgrC-4", "45min", "Mise en situation", 2],
      ["M-003-1", "CH-003-1-1", "Les 3 piliers d'un pitch inoubliable", "https://www.youtube.com/embed/example3", "40min", "Template de pitch", 1],
      ["M-004-1", "CH-004-1-1", "Valider son idée sans dépenser un centime", "https://www.youtube.com/embed/UTyO2f51jM0", "50min", "Checklist de validation", 1],
      ["M-007-1", "CH-007-1-1", "Définir sa marque et son audience cible", "https://www.youtube.com/embed/c3g-c1g_p-A", "45min", "Template: Persona", 1],
      ["M-007-2", "CH-007-2-1", "Lancer sa première campagne Facebook Ads", "https://www.youtube.com/embed/c3g-c1g_p-A", "1h 15min", "Checklist de campagne", 2],
      ["M-008-1", "CH-008-1-1", "Démystifier le Compte de Résultat", "https://www.youtube.com/embed/s94-t-iW_bA", "1h 00min", "Exemple de P&L", 1],
      ["M-009-1", "CH-009-1-1", "Rédiger une offre d'emploi attractive", "https://www.youtube.com/embed/Z3sa_K3-5sA", "35min", "Modèle d'offre d'emploi", 1]
    ];

    // Quiz
    const quizData = [
      ["CH-001-2-1", "Quelle est la durée recommandée pour un 'Pomodoro' ?", "25 minutes", "45 minutes", "1 heure", "15 minutes", "25 minutes"],
      ["CH-002-1-1", "Quelle affirmation correspond à un 'Growth Mindset' ?", "L'échec est une opportunité d'apprendre", "Je suis né comme ça", "Je ne suis pas bon en maths", "C'est trop difficile pour moi", "L'échec est une opportunité d'apprendre"],
      ["CH-004-1-1", "Quelle est la première étape pour valider une idée ?", "Créer un site web", "Parler à des clients potentiels", "Déposer un brevet", "Chercher des investisseurs", "Parler à des clients potentiels"],
      ["CH-007-2-1", "Quel est l'objectif principal d'une campagne de 'retargeting' ?", "Toucher une nouvelle audience", "Remercier les clients existants", "Recibler les visiteurs qui n'ont pas acheté", "Augmenter la notoriété de la marque", "Recibler les visiteurs qui n'ont pas acheté"],
      ["CH-008-1-1", "Que signifie l'acronyme 'EBITDA' ?", "Excédent Brut d'Exploitation", "Endettement Brut Total Annuel", "Estimation Brute des Dépenses", "Aucune de ces réponses", "Excédent Brut d'Exploitation"]
    ];

    // --- Insertion des données ---

    if (coursSheet && coursData.length > 0) {
      coursSheet.getRange(coursSheet.getLastRow() + 1, 1, coursData.length, coursData[0].length).setValues(coursData);
    }
    if (modulesSheet && modulesData.length > 0) {
      modulesSheet.getRange(modulesSheet.getLastRow() + 1, 1, modulesData.length, modulesData[0].length).setValues(modulesData);
    }
    if (chapitresSheet && chapitresData.length > 0) {
      chapitresSheet.getRange(chapitresSheet.getLastRow() + 1, 1, chapitresData.length, chapitresData[0].length).setValues(chapitresData);
    }
    if (quizChapitresSheet && quizData.length > 0) {
      quizChapitresSheet.getRange(quizChapitresSheet.getLastRow() + 1, 1, quizData.length, quizData[0].length).setValues(quizData);
    }
    if (quizModulesSheet) {
      // Pas de données de quiz de module pour l'instant
    }

    ui.alert("Données de démonstration ajoutées avec succès !");

  } catch (e) {
    ui.alert("Erreur lors de l'ajout des données de démo : " + e.message);
  }
}

/**
 * NOUVEAU: Supprime toutes les données (sauf les en-têtes) des feuilles de cours.
 */
function clearDemoData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    'Confirmation',
    'Voulez-vous vraiment supprimer toutes les données des feuilles de cours (les en-têtes seront conservés) ? Cette action est irréversible.',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    ui.alert('Opération annulée.');
    return;
  }

  try {
    const allSheets = ss.getSheets();
    let clearedCount = 0;

    allSheets.forEach(sheet => {
      const sheetName = sheet.getName();
      // Cible uniquement les feuilles qui suivent la structure des cours
      if (sheetName.startsWith('Cours_') || sheetName.startsWith('Modules_') || sheetName.startsWith('Chapitres_') || sheetName.startsWith('Quiz_')) {
        const lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
          clearedCount++;
        }
      }
    });

    ui.alert(`${clearedCount} feuille(s) ont été nettoyées.`);
    invalidateGlobalCache(); // Invalider le cache après suppression

  } catch (e) {
    ui.alert("Erreur lors de la suppression des données : " + e.message);
  }
}

// --- NOUVEAU: Fonctions de gestion de contenu via le menu ---

/**
 * Affiche une boîte de dialogue pour ajouter un nouveau cours.
 */
function addCourse() {
  const ui = SpreadsheetApp.getUi();
  const categoryName = getCategoryName();
  const coursSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(`Cours_${categoryName}`);

  if (!coursSheet) {
    ui.alert(`La feuille "Cours_${categoryName}" est introuvable.`);
    return;
  }

  const result = ui.prompt(
    'Ajouter un nouveau cours',
    'Entrez le nom du nouveau cours :',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() == ui.Button.OK && result.getResponseText()) {
    const courseName = result.getResponseText().trim();
    const newId = `C-${new Date().getTime().toString().slice(-6)}`;
    
    // Ajoute une nouvelle ligne avec l'ID et le nom, les autres champs sont à remplir manuellement.
    coursSheet.appendRow([newId, courseName]);
    ui.alert(`Cours "${courseName}" ajouté avec l'ID ${newId}. Veuillez compléter les autres informations dans la ligne.`);
  }
}

/**
 * Affiche une boîte de dialogue pour ajouter un nouveau module à un cours.
 */
function addModule() {
  const ui = SpreadsheetApp.getUi();
  const categoryName = getCategoryName();
  const modulesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(`Modules_${categoryName}`);

  if (!modulesSheet) {
    ui.alert(`La feuille "Modules_${categoryName}" est introuvable.`);
    return;
  }

  let courseId = ui.prompt('ID du Cours', 'À quel ID de cours ce module appartient-il ? (ex: C-001)', ui.ButtonSet.OK_CANCEL);
  if (courseId.getSelectedButton() !== ui.Button.OK || !courseId.getResponseText()) return;
  courseId = courseId.getResponseText().trim();

  let moduleName = ui.prompt('Nom du Module', 'Entrez le nom du nouveau module :', ui.ButtonSet.OK_CANCEL);
  if (moduleName.getSelectedButton() !== ui.Button.OK || !moduleName.getResponseText()) return;
  moduleName = moduleName.getResponseText().trim();

  let moduleDesc = ui.prompt('Description du Module', 'Entrez une courte description pour ce module :', ui.ButtonSet.OK_CANCEL);
  moduleDesc = moduleDesc.getResponseText().trim();

  // Calculer le prochain numéro d'ordre pour ce cours
  const allModules = sheetToJSON(modulesSheet);
  const modulesForCourse = allModules.filter(m => m.ID_Cours == courseId);
  const nextOrder = modulesForCourse.length + 1;

  const newId = `M-${courseId.split('-')[1]}-${nextOrder}`;

  modulesSheet.appendRow([courseId, newId, moduleName, moduleDesc, "", nextOrder]);
  ui.alert(`Module "${moduleName}" (Ordre: ${nextOrder}) ajouté au cours ${courseId}.`);
}

/**
 * Affiche une boîte de dialogue pour ajouter un nouveau chapitre à un module.
 */
function addChapter() {
  const ui = SpreadsheetApp.getUi();
  const categoryName = getCategoryName();
  const chapitresSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(`Chapitres_${categoryName}`);

  if (!chapitresSheet) {
    ui.alert(`La feuille "Chapitres_${categoryName}" est introuvable.`);
    return;
  }

  let moduleId = ui.prompt('ID du Module', 'À quel ID de module ce chapitre appartient-il ? (ex: M-001-1)', ui.ButtonSet.OK_CANCEL);
  if (moduleId.getSelectedButton() !== ui.Button.OK || !moduleId.getResponseText()) return;
  moduleId = moduleId.getResponseText().trim();

  let chapterName = ui.prompt('Nom du Chapitre', 'Entrez le nom du nouveau chapitre :', ui.ButtonSet.OK_CANCEL);
  if (chapterName.getSelectedButton() !== ui.Button.OK || !chapterName.getResponseText()) return;
  chapterName = chapterName.getResponseText().trim();

  let duration = ui.prompt('Durée', 'Entrez la durée du chapitre (ex: 7min, 1h15) :', ui.ButtonSet.OK_CANCEL);
  if (duration.getSelectedButton() !== ui.Button.OK || !duration.getResponseText()) return;
  duration = duration.getResponseText().trim();

  // Calculer le prochain numéro d'ordre pour ce module
  const allChapters = sheetToJSON(chapitresSheet);
  const chaptersForModule = allChapters.filter(c => c.ID_Module == moduleId);
  const nextOrder = chaptersForModule.length + 1;

  const newId = `CH-${moduleId.split('-')[1]}-${moduleId.split('-')[2]}-${nextOrder}`;

  chapitresSheet.appendRow([moduleId, newId, chapterName, "", duration, "", nextOrder]);
  ui.alert(`Chapitre "${chapterName}" (Ordre: ${nextOrder}) ajouté au module ${moduleId}.`);
}

/**
 * NOUVEAU: Ajoute un cours à partir d'une requête POST (ex: tableau de bord).
 */
function addCourseFromDashboard(data, origin) {
  try {
    const categoryName = getCategoryName();
    const coursSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(`Cours_${categoryName}`);
    if (!coursSheet) {
      throw new Error(`Feuille "Cours_${categoryName}" introuvable.`);
    }

    const newId = `C-${new Date().getTime().toString().slice(-6)}`;
    
    // Préparer la ligne avec les données fournies, en respectant l'ordre des colonnes
    // ["ID_Cours", "Nom_Cours", "Résumé", "Durée_Totale", "Niveau", "Prix", "URL_Vidéo_Intro", "Image_Couverture", "Freemium_Start", "Freemium_End", "Objectifs", "Prérequis", "Avantage_Senior", "Public_Cible", "Formateur_Nom", "Formateur_Titre", "Formateur_Bio", "Note_Moyenne", "Avis"]
    const newRow = [
      newId,                // ID_Cours
      data.nom,               // Nom_Cours
      data.resume,            // Résumé
      data.duree,             // Durée_Totale
      data.niveau,            // Niveau
      data.prix,              // Prix
      data.videoIntro,        // URL_Vidéo_Intro
      data.imageCouverture,   // Image_Couverture
      "0",                    // Freemium_Start (valeur par défaut)
      "1200",                 // Freemium_End (valeur par défaut, 20min)
      data.objectifs,         // Objectifs
      data.prerequis,         // Prérequis
      data.avantageSenior || `Le savoir-faire d'un expert.`, // Avantage_Senior (avec une valeur par défaut)
      data.publicCible,       // Public_Cible
      data.formateurNom,      // Formateur_Nom
      data.formateurTitre,    // Formateur_Titre
      data.formateurBio,      // Formateur_Bio
      "0",                    // Note_Moyenne (initiale)
      "0 Avis"                // Avis (initial)
    ];

    coursSheet.appendRow(newRow);
    invalidateGlobalCache(); // Important pour que le nouveau cours apparaisse
    return createJsonResponse({ success: true, id: newId, message: "Cours ajouté avec succès." }, origin);
  } catch (e) {
    return createJsonResponse({ success: false, error: e.message }, origin);
  }
}
