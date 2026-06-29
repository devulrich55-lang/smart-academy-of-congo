/**
 * Evo-smartUni — internationalisation (FR, EN, AR, PT, ES)
 */
(function () {
  const STORAGE_KEY = "sac_lang";
  const LANGS = [
    { code: "fr", label: "Français", flag: "🇫🇷", dir: "ltr" },
    { code: "en", label: "English", flag: "🇬🇧", dir: "ltr" },
    { code: "ar", label: "العربية", flag: "🇸🇦", dir: "rtl" },
    { code: "pt", label: "Português", flag: "🇵🇹", dir: "ltr" },
    { code: "es", label: "Español", flag: "🇪🇸", dir: "ltr" },
  ];

  const DICT = {
    fr: {
      "lang.choose": "Langue",
      "lang.switch": "Changer de langue",
      "nav.home": "Accueil",
      "nav.news": "Actualités",
      "nav.roles": "Qui utilise ?",
      "nav.library": "Bibliothèque Numérique",
      "nav.verify": "Vérifier diplôme",
      "nav.features": "Fonctionnalités",
      "nav.contact": "Contact",
      "nav.login": "Connexion",
      "nav.signup": "S'inscrire",
      "nav.myspace": "Mon espace",
      "nav.logout": "Déconnexion",
      "nav.menu": "Ouvrir le menu",
      "auth.back": "Retour à l'accueil",
      "auth.hero.title": "Connectez-vous à votre espace",
      "auth.hero.lead":
        "Choisissez d'abord votre profil — étudiant, professeur, assistant ou chef de section — puis saisissez vos identifiants pour accéder à vos informations officielles.",
      "auth.step1.title": "Sélectionnez votre profil",
      "auth.step1.desc": "Étudiant, professeur, assistant ou section",
      "auth.step2.title": "Renseignez vos identifiants",
      "auth.step2.desc": "Matricule ou e-mail institutionnel",
      "auth.step3.title": "Accédez à votre tableau de bord",
      "auth.step3.desc": "Notes, frais, cours ou administration du campus",
      "auth.card.title": "Connexion",
      "auth.card.subtitle": "Sélectionnez votre type de compte pour continuer",
      "auth.role.label": "Je me connecte en tant que",
      "auth.role.student": "Étudiant",
      "auth.role.prof": "Professeur",
      "auth.role.assistant": "Assistant",
      "auth.role.section": "Section",
      "auth.role.badge.student": "Espace étudiant",
      "auth.role.badge.prof": "Espace professeur",
      "auth.role.badge.assistant": "Espace assistant",
      "auth.role.badge.section": "Espace chef de section",
      "hero.badge": "Écosystème académique unifié — Afrique centrale et au-delà",
      "hero.title": 'Un seul système pour toutes les <span>universités</span> et instituts partenaires',
      "hero.text":
        "Inscription en ligne, résultats, paiement des frais, bibliothèque numérique, orientation IA, stages & emplois, réseau étudiant, cours en ligne et vérification officielle des diplômes — avec sécurité par campus et par rôle.",
      "hero.create": "Créer un compte",
      "hero.connect": "Se connecter",
      "hero.stat.unis": "Universités partenaires",
      "hero.stat.students": "Étudiants inscrits",
      "hero.stat.access": "Accès à vos données",
      "hero.badge.live": "🔴 Cours en direct",
      "hero.badge.video": "🎥 Réunions vidéo",
      "hero.card.avg": "Moyenne générale",
      "hero.card.fees": "Frais payés",
      "showcase.label": "Enseignement connecté",
      "showcase.title": "Cours en direct & réunions institutionnelles",
      "showcase.desc":
        "Vidéo live, partage d'écran, chat, enregistrements et comptes rendus IA — pour les cours, les réunions de section et les conseils de faculté.",
      "showcase.c1.tag": "Cours en direct",
      "showcase.c1.title": "Enseignement live",
      "showcase.c1.text":
        "Le professeur anime sa session en vidéo. Les étudiants rejoignent, posent des questions et revoient l'enregistrement.",
      "showcase.c2.tag": "Réunions",
      "showcase.c2.title": "Visioconférence",
      "showcase.c2.text":
        "Chef de section, professeurs et direction se réunissent en ligne — votes, documents et synthèse IA.",
      "showcase.c3.tag": "Collaboration",
      "showcase.c3.title": "Classe internationale",
      "showcase.c3.text":
        "Échanges multi-pays, statistiques académiques et gouvernance connectée sur un même écosystème.",
      "showcase.cta": "Accéder à la Bibliothèque Numérique",
      "news.label": "Informations officielles",
      "news.title": "Actualités, concours, bourses & opportunités",
      "news.desc":
        'Choisissez votre <strong>pays</strong> pour afficher uniquement les informations locales : ministère, concours, bourses, opportunités et annonces des campus du pays. Filtrez aussi par <strong>catégorie</strong> et par <strong>établissement</strong>.',
      "news.country": "Pays / territoire",
      "news.country.aria": "Choisir un pays africain",
      "news.filter.aria": "Filtrer par catégorie",
      "news.uni.all": "🏛️ Tous les établissements du pays",
      "news.uni.aria": "Filtrer par établissement",
      "news.empty":
        "Aucune publication pour le moment. Le Ministère et les universités partenaires publient depuis leurs portails respectifs.",
      "news.portals":
        'Ministère : <a href="ministere/" style="color:var(--primary);font-weight:600;">Portail MESU</a> · Université : <a href="admin-uni/" style="color:var(--primary);font-weight:600;">Portail campus</a>',
      "news.all": "Toutes",
      "news.hint.all": "Affichage de toutes les publications africaines classées par catégorie.",
      "news.hint.local": "Informations locales pour {country} uniquement — ministère, concours, bourses et campus du pays.",
      "news.empty.all":
        "Aucune publication pour le moment. Les ministères et universités partenaires publient depuis leurs portails.",
      "news.empty.local":
        "Aucune publication locale pour {country} pour le moment. Essayez « Tous les pays » ou un autre pays.",
      "news.cat.officiel": "Information officielle",
      "news.cat.gouvernemental": "Gouvernement",
      "news.cat.concours": "Concours",
      "news.cat.opportunite": "Opportunité",
      "news.cat.bourse": "Bourse d'études",
      "auth.connected": "Connecté",
      "auth.welcome.back": "Bon retour, <strong>{name}</strong> — session active",
      "auth.logout.action": "Se déconnecter",
      "roles.label": "Pour qui ?",
      "roles.title": "Une plateforme pour toute la communauté universitaire",
      "roles.desc":
        "Chaque acteur accède à un espace dédié avec des informations vérifiées par l'université, pour plus de transparence et moins de paperasse.",
      "roles.student.title": "Étudiants",
      "roles.student.desc": "Consultez votre parcours académique et administratif depuis votre compte personnel.",
      "roles.student.l1": "Notes et relevés de cotes",
      "roles.student.l2": "Frais payés et factures en attente",
      "roles.student.l3": "Emploi du temps et examens",
      "roles.student.l4": "Documents officiels (attestations, certificats)",
      "roles.prof.title": "Professeurs",
      "roles.prof.desc": "Gérez vos cours et communiquez avec vos étudiants et l'administration.",
      "roles.prof.l1": "Saisie et publication des notes",
      "roles.prof.l2": "Liste des étudiants par cours",
      "roles.prof.l3": "Calendrier des évaluations",
      "roles.prof.l4": "Messages de la faculté",
      "roles.assistant.title": "Assistants",
      "roles.assistant.desc":
        "Appuyez l'administration universitaire et facilitez le parcours des étudiants au quotidien.",
      "roles.assistant.l1": "Traitement des dossiers et inscriptions",
      "roles.assistant.l2": "Suivi des frais et paiements étudiants",
      "roles.assistant.l3": "Édition d'attestations et documents",
      "roles.assistant.l4": "Accueil et orientation sur le campus",
      "roles.uni.title": "Universités",
      "roles.uni.desc": "Pilotez votre campus et diffusez des informations fiables à toute la communauté.",
      "roles.uni.l1": "Gestion des inscriptions et frais",
      "roles.uni.l2": "Tableau de bord administratif",
      "roles.uni.l3": "Annonces et actualités du campus",
      "roles.uni.l4": "Statistiques et rapports",
      "roles.uni.cta": "Portail admin campus",
      "features.label": "Écosystème complet",
      "features.title": "10 piliers pour nous différencier des autres plateformes",
      "features.desc":
        "Un réseau national unifié avec contrôle d'accès JWT, journal d'audit, filtrage par université et vérification cryptographique des diplômes.",
      "features.p1.title": "Système unifié multi-universités",
      "features.p1.text":
        "Un portail national : chaque campus garde son autonomie tout en partageant standards, tarifs et annonces nationales.",
      "features.p1.tag": "Réseau SAC",
      "features.p2.title": "Inscription en ligne",
      "features.p2.text":
        "Dossier numérique, choix d'établissement, sections et paiement initial avec validation assistant / université.",
      "features.p2.tag": "Sécurisé",
      "features.p3.title": "Résultats académiques",
      "features.p3.text":
        "Cotes par semestre saisies par les professeurs, moyennes calculées et statuts Validé / Rattrapage.",
      "features.p3.tag": "Disponible",
      "features.p4.title": "Paiement des frais",
      "features.p4.text":
        "Virement bancaire partenaire, suivi des trimestres et validation assistant / université avant accès complet.",
      "features.p4.tag": "Banque · USD/CDF",
      "features.p5.title": "Bibliothèque numérique",
      "features.p5.text":
        "Livres officiels publiés par le Ministère, consultation en ligne pour les utilisateurs connectés.",
      "features.p5.tag": "National",
      "features.p6.title": "IA orientation académique",
      "features.p6.text":
        "Conseils de parcours, compétences et stages selon filière et niveau (complément au service orientation).",
      "features.p6.tag": "Disponible",
      "features.p7.title": "Stages & emplois",
      "features.p7.text": "Offres campus et nationales publiées par universités et partenaires.",
      "features.p7.tag": "Disponible",
      "features.p8.title": "Réseau social étudiant",
      "features.p8.text":
        "Fil campus modéré, likes et audience par filière — sans quitter l'écosystème officiel.",
      "features.p8.tag": "Disponible",
      "features.p9.title": "Réunions institutionnelles",
      "features.p9.text":
        "Chef de section ↔ professeurs, doyen ↔ chefs de section — vidéo, votes, documents et compte rendu IA.",
      "features.p9.tag": "Gouvernance",
      "features.p10.title": "Cours en ligne & direct",
      "features.p10.text":
        "Catalogue MOOC campus, inscription en ligne et sessions live (vidéo, chat, partage d'écran).",
      "features.p10.tag": "Disponible",
      "features.p11.title": "Vérification officielle des diplômes",
      "features.p11.text":
        "Numéro unique, code de vérification et signature HMAC — page publique pour employeurs.",
      "features.p11.tag": "Disponible",
      "features.p11.link": "Vérifier un diplôme →",
      "cta.title": "Rejoignez Evo-smartUni",
      "cta.desc":
        "Inscrivez-vous en tant qu'étudiant, professeur ou assistant pour accéder à toutes vos informations en ligne.",
      "cta.partner": 'Université partenaire ? <a href="admin-uni/" style="color:#fff;font-weight:600;text-decoration:underline;">Portail admin campus</a>',
      "footer.brand":
        "Plateforme de gestion académique et administrative pour les universités et instituts partenaires en Afrique centrale et dans la région.",
      "footer.platform": "Plateforme",
      "footer.official": "Actualités officielles",
      "footer.account": "Compte",
      "footer.forgot": "Mot de passe oublié",
      "footer.payments": "Paiements",
      "footer.contact": "Contact",
      "footer.universities": "Universités (portail admin)",
      "footer.region": "Afrique centrale · Multi-pays",
      "footer.rights": "© 2026 Evo-smartUni. Tous droits réservés.",
      "footer.legal": "Confidentialité · Conditions d'utilisation",
      "welcome": "Bienvenue, {name} !",
      "meta.index.title": "Evo-smartUni",
      "meta.index.desc":
        "Evo-smartUni — Plateforme académique fiable pour universités, étudiants et professeurs.",
      "meta.login.title": "Connexion — Evo-smartUni",
      "theme.toggle": "Basculer entre mode clair et mode nocturne",
    },
    en: {
      "lang.choose": "Language",
      "lang.switch": "Change language",
      "nav.home": "Home",
      "nav.news": "News",
      "nav.roles": "Who uses it?",
      "nav.library": "Digital Library",
      "nav.verify": "Verify diploma",
      "nav.features": "Features",
      "nav.contact": "Contact",
      "nav.login": "Log in",
      "nav.signup": "Sign up",
      "nav.myspace": "My space",
      "nav.logout": "Log out",
      "nav.menu": "Open menu",
      "auth.back": "Back to home",
      "auth.hero.title": "Sign in to your space",
      "auth.hero.lead":
        "First choose your profile — student, professor, assistant or section head — then enter your credentials to access your official information.",
      "auth.step1.title": "Select your profile",
      "auth.step1.desc": "Student, professor, assistant or section",
      "auth.step2.title": "Enter your credentials",
      "auth.step2.desc": "Student ID or institutional email",
      "auth.step3.title": "Access your dashboard",
      "auth.step3.desc": "Grades, fees, courses or campus administration",
      "auth.card.title": "Log in",
      "auth.card.subtitle": "Select your account type to continue",
      "auth.role.label": "I am signing in as",
      "auth.role.student": "Student",
      "auth.role.prof": "Professor",
      "auth.role.assistant": "Assistant",
      "auth.role.section": "Section",
      "auth.role.badge.student": "Student space",
      "auth.role.badge.prof": "Professor space",
      "auth.role.badge.assistant": "Assistant space",
      "auth.role.badge.section": "Section head space",
      "hero.badge": "Unified academic ecosystem — Central Africa and beyond",
      "hero.title": 'One system for all partner <span>universities</span> and institutes',
      "hero.text":
        "Online registration, results, fee payment, digital library, AI guidance, internships & jobs, student network, online courses and official diploma verification — with security per campus and role.",
      "hero.create": "Create an account",
      "hero.connect": "Log in",
      "hero.stat.unis": "Partner universities",
      "hero.stat.students": "Enrolled students",
      "hero.stat.access": "Access to your data",
      "hero.badge.live": "🔴 Live classes",
      "hero.badge.video": "🎥 Video meetings",
      "hero.card.avg": "Overall average",
      "hero.card.fees": "Fees paid",
      "showcase.label": "Connected teaching",
      "showcase.title": "Live classes & institutional meetings",
      "showcase.desc":
        "Live video, screen sharing, chat, recordings and AI summaries — for classes, section meetings and faculty councils.",
      "showcase.c1.tag": "Live class",
      "showcase.c1.title": "Live teaching",
      "showcase.c1.text":
        "The professor runs the session on video. Students join, ask questions and replay the recording.",
      "showcase.c2.tag": "Meetings",
      "showcase.c2.title": "Videoconference",
      "showcase.c2.text":
        "Section heads, professors and leadership meet online — votes, documents and AI summary.",
      "showcase.c3.tag": "Collaboration",
      "showcase.c3.title": "International classroom",
      "showcase.c3.text":
        "Multi-country exchanges, academic statistics and connected governance on one ecosystem.",
      "showcase.cta": "Access the Digital Library",
      "news.label": "Official information",
      "news.title": "News, competitions, scholarships & opportunities",
      "news.desc":
        'Choose your <strong>country</strong> to show only local information: ministry, competitions, scholarships, opportunities and campus announcements. Also filter by <strong>category</strong> and <strong>institution</strong>.',
      "news.country": "Country / territory",
      "news.country.aria": "Choose an African country",
      "news.filter.aria": "Filter by category",
      "news.uni.all": "🏛️ All institutions in the country",
      "news.uni.aria": "Filter by institution",
      "news.empty":
        "No publications yet. The Ministry and partner universities publish from their respective portals.",
      "news.portals":
        'Ministry: <a href="ministere/" style="color:var(--primary);font-weight:600;">MESU Portal</a> · University: <a href="admin-uni/" style="color:var(--primary);font-weight:600;">Campus portal</a>',
      "news.all": "All",
      "news.hint.all": "Showing all African publications sorted by category.",
      "news.hint.local": "Local information for {country} only — ministry, competitions, scholarships and campus news.",
      "news.empty.all":
        "No publications yet. Ministries and partner universities publish from their portals.",
      "news.empty.local":
        "No local publications for {country} yet. Try « All countries » or another country.",
      "news.cat.officiel": "Official information",
      "news.cat.gouvernemental": "Government",
      "news.cat.concours": "Competitions",
      "news.cat.opportunite": "Opportunity",
      "news.cat.bourse": "Scholarship",
      "auth.connected": "Logged in",
      "auth.welcome.back": "Welcome back, <strong>{name}</strong> — active session",
      "auth.logout.action": "Log out",
      "roles.label": "For whom?",
      "roles.title": "A platform for the entire university community",
      "roles.desc":
        "Each stakeholder accesses a dedicated space with university-verified information for more transparency and less paperwork.",
      "roles.student.title": "Students",
      "roles.student.desc": "View your academic and administrative journey from your personal account.",
      "roles.student.l1": "Grades and transcripts",
      "roles.student.l2": "Paid fees and pending invoices",
      "roles.student.l3": "Timetable and exams",
      "roles.student.l4": "Official documents (certificates, attestations)",
      "roles.prof.title": "Professors",
      "roles.prof.desc": "Manage your courses and communicate with students and administration.",
      "roles.prof.l1": "Grade entry and publication",
      "roles.prof.l2": "Student lists per course",
      "roles.prof.l3": "Assessment calendar",
      "roles.prof.l4": "Faculty messages",
      "roles.assistant.title": "Assistants",
      "roles.assistant.desc":
        "Support university administration and help students with daily processes.",
      "roles.assistant.l1": "Processing files and registrations",
      "roles.assistant.l2": "Tracking student fees and payments",
      "roles.assistant.l3": "Issuing certificates and documents",
      "roles.assistant.l4": "Campus welcome and orientation",
      "roles.uni.title": "Universities",
      "roles.uni.desc": "Manage your campus and share reliable information with the community.",
      "roles.uni.l1": "Registration and fee management",
      "roles.uni.l2": "Administrative dashboard",
      "roles.uni.l3": "Campus news and announcements",
      "roles.uni.l4": "Statistics and reports",
      "roles.uni.cta": "Campus admin portal",
      "features.label": "Complete ecosystem",
      "features.title": "10 pillars that set us apart",
      "features.desc":
        "A unified national network with JWT access control, audit log, university filtering and cryptographic diploma verification.",
      "features.p1.title": "Multi-university unified system",
      "features.p1.text":
        "A national portal: each campus keeps autonomy while sharing standards, fees and national announcements.",
      "features.p1.tag": "SAC Network",
      "features.p2.title": "Online registration",
      "features.p2.text":
        "Digital file, institution choice, sections and initial payment with assistant / university validation.",
      "features.p2.tag": "Secure",
      "features.p3.title": "Academic results",
      "features.p3.text":
        "Semester grades entered by professors, averages calculated and Passed / Resit status.",
      "features.p3.tag": "Available",
      "features.p4.title": "Fee payment",
      "features.p4.text":
        "Partner bank transfer, term tracking and assistant / university validation before full access.",
      "features.p4.tag": "Bank · USD/CDF",
      "features.p5.title": "Digital library",
      "features.p5.text":
        "Official books published by the Ministry, online access for logged-in users.",
      "features.p5.tag": "National",
      "features.p6.title": "Academic guidance AI",
      "features.p6.text":
        "Pathway, skills and internship advice by field and level (complement to orientation services).",
      "features.p6.tag": "Available",
      "features.p7.title": "Internships & jobs",
      "features.p7.text": "Campus and national offers published by universities and partners.",
      "features.p7.tag": "Available",
      "features.p8.title": "Student social network",
      "features.p8.text":
        "Moderated campus feed, likes and audience by field — without leaving the official ecosystem.",
      "features.p8.tag": "Available",
      "features.p9.title": "Institutional meetings",
      "features.p9.text":
        "Section head ↔ professors, dean ↔ section heads — video, votes, documents and AI minutes.",
      "features.p9.tag": "Governance",
      "features.p10.title": "Online & live courses",
      "features.p10.text":
        "Campus MOOC catalogue, online registration and live sessions (video, chat, screen sharing).",
      "features.p10.tag": "Available",
      "features.p11.title": "Official diploma verification",
      "features.p11.text":
        "Unique number, verification code and HMAC signature — public page for employers.",
      "features.p11.tag": "Available",
      "features.p11.link": "Verify a diploma →",
      "cta.title": "Join Evo-smartUni",
      "cta.desc":
        "Register as a student, professor or assistant to access all your information online.",
      "cta.partner": 'Partner university? <a href="admin-uni/" style="color:#fff;font-weight:600;text-decoration:underline;">Campus admin portal</a>',
      "footer.brand":
        "Academic and administrative management platform for partner universities and institutes in Central Africa and the region.",
      "footer.platform": "Platform",
      "footer.official": "Official news",
      "footer.account": "Account",
      "footer.forgot": "Forgot password",
      "footer.payments": "Payments",
      "footer.contact": "Contact",
      "footer.universities": "Universities (admin portal)",
      "footer.region": "Central Africa · Multi-country",
      "footer.rights": "© 2026 Evo-smartUni. All rights reserved.",
      "footer.legal": "Privacy · Terms of use",
      "welcome": "Welcome, {name}!",
      "meta.index.title": "Evo-smartUni",
      "meta.index.desc":
        "Evo-smartUni — Reliable academic platform for universities, students and professors.",
      "meta.login.title": "Log in — Evo-smartUni",
      "theme.toggle": "Toggle light / dark mode",
    },
    ar: {
      "lang.choose": "اللغة",
      "lang.switch": "تغيير اللغة",
      "nav.home": "الرئيسية",
      "nav.news": "الأخبار",
      "nav.roles": "من يستخدمها؟",
      "nav.library": "المكتبة الرقمية",
      "nav.verify": "التحقق من الشهادة",
      "nav.features": "الميزات",
      "nav.contact": "اتصل بنا",
      "nav.login": "تسجيل الدخول",
      "nav.signup": "إنشاء حساب",
      "nav.myspace": "مساحتي",
      "nav.logout": "تسجيل الخروج",
      "nav.menu": "فتح القائمة",
      "auth.back": "العودة إلى الرئيسية",
      "auth.hero.title": "سجّل الدخول إلى مساحتك",
      "auth.hero.lead":
        "اختر أولاً ملفك — طالب، أستاذ، مساعد أو رئيس قسم — ثم أدخل بياناتك للوصول إلى معلوماتك الرسمية.",
      "auth.step1.title": "اختر ملفك",
      "auth.step1.desc": "طالب، أستاذ، مساعد أو قسم",
      "auth.step2.title": "أدخل بيانات الدخول",
      "auth.step2.desc": "رقم التسجيل أو البريد المؤسسي",
      "auth.step3.title": "ادخل إلى لوحة التحكم",
      "auth.step3.desc": "الدرجات، الرسوم، الدروس أو إدارة الحرم",
      "auth.card.title": "تسجيل الدخول",
      "auth.card.subtitle": "اختر نوع حسابك للمتابعة",
      "auth.role.label": "أسجّل الدخول كـ",
      "auth.role.student": "طالب",
      "auth.role.prof": "أستاذ",
      "auth.role.assistant": "مساعد",
      "auth.role.section": "قسم",
      "auth.role.badge.student": "مساحة الطالب",
      "auth.role.badge.prof": "مساحة الأستاذ",
      "auth.role.badge.assistant": "مساحة المساعد",
      "auth.role.badge.section": "مساحة رئيس القسم",
      "hero.badge": "نظام أكاديمي موحّد — وسط أفريقيا وما بعدها",
      "hero.title": 'نظام واحد لجميع <span>الجامعات</span> والمعاهد الشريكة',
      "hero.text":
        "التسجيل عبر الإنترنت، النتائج، دفع الرسوم، المكتبة الرقمية، التوجيه بالذكاء الاصطناعي، التدريب والوظائف، شبكة الطلاب، الدروس عبر الإنترنت والتحقق الرسمي من الشهادات — بأمان حسب الحرم والدور.",
      "hero.create": "إنشاء حساب",
      "hero.connect": "تسجيل الدخول",
      "hero.stat.unis": "جامعات شريكة",
      "hero.stat.students": "طلاب مسجلون",
      "hero.stat.access": "الوصول إلى بياناتك",
      "hero.badge.live": "🔴 دروس مباشرة",
      "hero.badge.video": "🎥 اجتماعات فيديو",
      "hero.card.avg": "المعدل العام",
      "hero.card.fees": "الرسوم المدفوعة",
      "showcase.label": "تعليم متصل",
      "showcase.title": "دروس مباشرة واجتماعات مؤسسية",
      "showcase.desc":
        "فيديو مباشر، مشاركة الشاشة، دردشة، تسجيلات وملخصات بالذكاء الاصطناعي — للدروس واجتماعات الأقسام ومجالس الكلية.",
      "showcase.c1.tag": "درس مباشر",
      "showcase.c1.title": "تعليم مباشر",
      "showcase.c1.text":
        "يقدّم الأستاذ حصته بالفيديو. ينضم الطلاب، يطرحون الأسئلة ويعيدون مشاهدة التسجيل.",
      "showcase.c2.tag": "اجتماعات",
      "showcase.c2.title": "مؤتمر فيديو",
      "showcase.c2.text":
        "رؤساء الأقسام والأساتذة والإدارة يجتمعون عبر الإنترنت — تصويت، مستندات وملخص بالذكاء الاصطناعي.",
      "showcase.c3.tag": "تعاون",
      "showcase.c3.title": "فصل دولي",
      "showcase.c3.text":
        "تبادلات متعددة البلدان، إحصائيات أكاديمية وحوكمة متصلة في نظام واحد.",
      "showcase.cta": "الوصول إلى المكتبة الرقمية",
      "news.label": "معلومات رسمية",
      "news.title": "أخبار، مسابقات، منح وفرص",
      "news.desc":
        'اختر <strong>بلدك</strong> لعرض المعلومات المحلية فقط: الوزارة، المسابقات، المنح، الفرص وإعلانات الحرم الجامعي. صفِّ أيضاً حسب <strong>الفئة</strong> و<strong>المؤسسة</strong>.',
      "news.country": "البلد / الإقليم",
      "news.country.aria": "اختر بلداً أفريقياً",
      "news.filter.aria": "تصفية حسب الفئة",
      "news.uni.all": "🏛️ جميع المؤسسات في البلد",
      "news.uni.aria": "تصفية حسب المؤسسة",
      "news.empty":
        "لا توجد منشورات حالياً. الوزارة والجامعات الشريكة تنشر من بواباتها.",
      "news.portals":
        'الوزارة: <a href="ministere/" style="color:var(--primary);font-weight:600;">بوابة MESU</a> · الجامعة: <a href="admin-uni/" style="color:var(--primary);font-weight:600;">بوابة الحرم</a>',
      "news.all": "الكل",
      "news.hint.all": "عرض جميع المنشورات الأفريقية مصنّفة حسب الفئة.",
      "news.hint.local": "معلومات محلية لـ {country} فقط — الوزارة، المسابقات، المنح وأخبار الحرم.",
      "news.empty.all":
        "لا توجد منشورات حالياً. الوزارات والجامعات الشريكة تنشر من بواباتها.",
      "news.empty.local":
        "لا توجد منشورات محلية لـ {country} حالياً. جرّب « جميع البلدان » أو بلداً آخر.",
      "news.cat.officiel": "معلومات رسمية",
      "news.cat.gouvernemental": "حكومة",
      "news.cat.concours": "مسابقات",
      "news.cat.opportunite": "فرصة",
      "news.cat.bourse": "منحة دراسية",
      "auth.connected": "متصل",
      "auth.welcome.back": "مرحباً بعودتك، <strong>{name}</strong> — جلسة نشطة",
      "auth.logout.action": "تسجيل الخروج",
      "roles.label": "لمن؟",
      "roles.title": "منصة لمجتمع الجامعة بأكمله",
      "roles.desc":
        "كل فاعل يصل إلى مساحة مخصصة بمعلومات موثّقة من الجامعة لمزيد من الشفافية وأقل أوراق.",
      "roles.student.title": "الطلاب",
      "roles.student.desc": "اطلع على مسارك الأكاديمي والإداري من حسابك الشخصي.",
      "roles.student.l1": "الدرجات وكشوف النقاط",
      "roles.student.l2": "الرسوم المدفوعة والفواتير المعلقة",
      "roles.student.l3": "الجدول والامتحانات",
      "roles.student.l4": "وثائق رسمية (شهادات، إفادات)",
      "roles.prof.title": "الأساتذة",
      "roles.prof.desc": "أدر دوراتك وتواصل مع طلابك والإدارة.",
      "roles.prof.l1": "إدخال ونشر الدرجات",
      "roles.prof.l2": "قوائم الطلاب حسب المقرر",
      "roles.prof.l3": "تقويم التقييمات",
      "roles.prof.l4": "رسائل الكلية",
      "roles.assistant.title": "المساعدون",
      "roles.assistant.desc":
        "ادعم الإدارة الجامعية وسهّل مسار الطلاب اليومي.",
      "roles.assistant.l1": "معالجة الملفات والتسجيلات",
      "roles.assistant.l2": "متابعة رسوم ومدفوعات الطلاب",
      "roles.assistant.l3": "إصدار الشهادات والوثائق",
      "roles.assistant.l4": "الاستقبال والتوجيه في الحرم",
      "roles.uni.title": "الجامعات",
      "roles.uni.desc": "أدر حرمك وانشر معلومات موثوقة للمجتمع.",
      "roles.uni.l1": "إدارة التسجيل والرسوم",
      "roles.uni.l2": "لوحة تحكم إدارية",
      "roles.uni.l3": "أخبار وإعلانات الحرم",
      "roles.uni.l4": "إحصائيات وتقارير",
      "roles.uni.cta": "بوابة إدارة الحرم",
      "features.label": "نظام متكامل",
      "features.title": "10 ركائز تميزنا عن المنصات الأخرى",
      "features.desc":
        "شبكة وطنية موحّدة مع تحكم JWT، سجل تدقيق، تصفية حسب الجامعة والتحقق التشفيري من الشهادات.",
      "features.p1.title": "نظام موحّد متعدد الجامعات",
      "features.p1.text":
        "بوابة وطنية: كل حرم يحتفظ باستقلاليته مع مشاركة المعايير والرسوم والإعلانات الوطنية.",
      "features.p1.tag": "شبكة SAC",
      "features.p2.title": "التسجيل عبر الإنترنت",
      "features.p2.text":
        "ملف رقمي، اختيار المؤسسة، الأقسام والدفع الأولي مع التحقق من المساعد / الجامعة.",
      "features.p2.tag": "آمن",
      "features.p3.title": "النتائج الأكاديمية",
      "features.p3.text":
        "درجات الفصل يدخلها الأساتذة، متوسطات محسوبة وحالة ناجح / إعادة.",
      "features.p3.tag": "متاح",
      "features.p4.title": "دفع الرسوم",
      "features.p4.text":
        "تحويل بنكي شريك، متابعة الفصول والتحقق قبل الوصول الكامل.",
      "features.p4.tag": "بنك · USD/CDF",
      "features.p5.title": "مكتبة رقمية",
      "features.p5.text":
        "كتب رسمية تنشرها الوزارة، قراءة عبر الإنترنت للمستخدمين المسجلين.",
      "features.p5.tag": "وطني",
      "features.p6.title": "ذكاء اصطناعي للتوجيه",
      "features.p6.text":
        "نصائح مسار ومهارات وتدريب حسب التخصص والمستوى.",
      "features.p6.tag": "متاح",
      "features.p7.title": "تدريب ووظائف",
      "features.p7.text": "عروض حرم ووطنية تنشرها الجامعات والشركاء.",
      "features.p7.tag": "متاح",
      "features.p8.title": "شبكة اجتماعية للطلاب",
      "features.p8.text":
        "خلاصة حرم مُشرفة، إعجابات وجمهور حسب التخصص — دون مغادرة النظام الرسمي.",
      "features.p8.tag": "متاح",
      "features.p9.title": "اجتماعات مؤسسية",
      "features.p9.text":
        "رئيس قسم ↔ أساتذة، عميد ↔ رؤساء أقسام — فيديو، تصويت، مستندات ومحضر بالذكاء الاصطناعي.",
      "features.p9.tag": "حوكمة",
      "features.p10.title": "دروس عبر الإنترنت ومباشرة",
      "features.p10.text":
        "كتالوج MOOC للحرم، تسجيل عبر الإنترنت وجلسات مباشرة (فيديو، دردشة، مشاركة شاشة).",
      "features.p10.tag": "متاح",
      "features.p11.title": "التحقق الرسمي من الشهادات",
      "features.p11.text":
        "رقم فريد، رمز تحقق وتوقيع HMAC — صفحة عامة لأصحاب العمل.",
      "features.p11.tag": "متاح",
      "features.p11.link": "التحقق من شهادة →",
      "cta.title": "انضم إلى Evo-smartUni",
      "cta.desc":
        "سجّل كطالب أو أستاذ أو مساعد للوصول إلى جميع معلوماتك عبر الإنترنت.",
      "cta.partner": 'جامعة شريكة؟ <a href="admin-uni/" style="color:#fff;font-weight:600;text-decoration:underline;">بوابة إدارة الحرم</a>',
      "footer.brand":
        "منصة إدارة أكاديمية وإدارية للجامعات والمعاهد الشريكة في وسط أفريقيا والمنطقة.",
      "footer.platform": "المنصة",
      "footer.official": "أخبار رسمية",
      "footer.account": "الحساب",
      "footer.forgot": "نسيت كلمة المرور",
      "footer.payments": "المدفوعات",
      "footer.contact": "اتصل بنا",
      "footer.universities": "الجامعات (بوابة الإدارة)",
      "footer.region": "وسط أفريقيا · متعدد البلدان",
      "footer.rights": "© 2026 Evo-smartUni. جميع الحقوق محفوظة.",
      "footer.legal": "الخصوصية · شروط الاستخدام",
      "welcome": "مرحباً، {name}!",
      "meta.index.title": "Evo-smartUni",
      "meta.index.desc":
        "Evo-smartUni — منصة أكاديمية موثوقة للجامعات والطلاب والأساتذة.",
      "meta.login.title": "تسجيل الدخول — Evo-smartUni",
      "theme.toggle": "التبديل بين الوضع الفاتح والداكن",
    },
    pt: {
      "lang.choose": "Idioma",
      "lang.switch": "Mudar idioma",
      "nav.home": "Início",
      "nav.news": "Notícias",
      "nav.roles": "Quem usa?",
      "nav.library": "Biblioteca Digital",
      "nav.verify": "Verificar diploma",
      "nav.features": "Funcionalidades",
      "nav.contact": "Contacto",
      "nav.login": "Entrar",
      "nav.signup": "Registar-se",
      "nav.myspace": "O meu espaço",
      "nav.logout": "Sair",
      "nav.menu": "Abrir menu",
      "auth.back": "Voltar ao início",
      "auth.hero.title": "Entre no seu espaço",
      "auth.hero.lead":
        "Escolha primeiro o seu perfil — estudante, professor, assistente ou chefe de secção — depois introduza as credenciais para aceder às informações oficiais.",
      "auth.step1.title": "Selecione o seu perfil",
      "auth.step1.desc": "Estudante, professor, assistente ou secção",
      "auth.step2.title": "Introduza as credenciais",
      "auth.step2.desc": "Matrícula ou e-mail institucional",
      "auth.step3.title": "Aceda ao painel",
      "auth.step3.desc": "Notas, propinas, cursos ou administração do campus",
      "auth.card.title": "Entrar",
      "auth.card.subtitle": "Selecione o tipo de conta para continuar",
      "auth.role.label": "Entro como",
      "auth.role.student": "Estudante",
      "auth.role.prof": "Professor",
      "auth.role.assistant": "Assistente",
      "auth.role.section": "Secção",
      "auth.role.badge.student": "Espaço estudante",
      "auth.role.badge.prof": "Espaço professor",
      "auth.role.badge.assistant": "Espaço assistente",
      "auth.role.badge.section": "Espaço chefe de secção",
      "hero.badge": "Ecossistema académico unificado — África Central e além",
      "hero.title": 'Um só sistema para todas as <span>universidades</span> e institutos parceiros',
      "hero.text":
        "Inscrição online, resultados, pagamento de propinas, biblioteca digital, orientação IA, estágios e empregos, rede estudantil, cursos online e verificação oficial de diplomas — com segurança por campus e função.",
      "hero.create": "Criar conta",
      "hero.connect": "Entrar",
      "hero.stat.unis": "Universidades parceiras",
      "hero.stat.students": "Estudantes inscritos",
      "hero.stat.access": "Acesso aos seus dados",
      "hero.badge.live": "🔴 Aulas ao vivo",
      "hero.badge.video": "🎥 Reuniões em vídeo",
      "hero.card.avg": "Média geral",
      "hero.card.fees": "Propinas pagas",
      "showcase.label": "Ensino conectado",
      "showcase.title": "Aulas ao vivo e reuniões institucionais",
      "showcase.desc":
        "Vídeo ao vivo, partilha de ecrã, chat, gravações e atas IA — para aulas, reuniões de secção e conselhos de faculdade.",
      "showcase.c1.tag": "Aula ao vivo",
      "showcase.c1.title": "Ensino ao vivo",
      "showcase.c1.text":
        "O professor anima a sessão em vídeo. Os estudantes entram, fazem perguntas e reveem a gravação.",
      "showcase.c2.tag": "Reuniões",
      "showcase.c2.title": "Videoconferência",
      "showcase.c2.text":
        "Chefe de secção, professores e direção reúnem-se online — votos, documentos e síntese IA.",
      "showcase.c3.tag": "Colaboração",
      "showcase.c3.title": "Sala internacional",
      "showcase.c3.text":
        "Trocas multi-país, estatísticas académicas e governação conectada num só ecossistema.",
      "showcase.cta": "Aceder à Biblioteca Digital",
      "news.label": "Informações oficiais",
      "news.title": "Notícias, concursos, bolsas e oportunidades",
      "news.desc":
        'Escolha o seu <strong>país</strong> para mostrar apenas informações locais: ministério, concursos, bolsas, oportunidades e anúncios do campus. Filtre também por <strong>categoria</strong> e <strong>instituição</strong>.',
      "news.country": "País / território",
      "news.country.aria": "Escolher um país africano",
      "news.filter.aria": "Filtrar por categoria",
      "news.uni.all": "🏛️ Todas as instituições do país",
      "news.uni.aria": "Filtrar por instituição",
      "news.empty":
        "Sem publicações por agora. O Ministério e universidades parceiras publicam nos respetivos portais.",
      "news.portals":
        'Ministério: <a href="ministere/" style="color:var(--primary);font-weight:600;">Portal MESU</a> · Universidade: <a href="admin-uni/" style="color:var(--primary);font-weight:600;">Portal campus</a>',
      "news.all": "Todas",
      "news.hint.all": "A mostrar todas as publicações africanas por categoria.",
      "news.hint.local": "Informações locais apenas para {country} — ministério, concursos, bolsas e campus.",
      "news.empty.all":
        "Sem publicações por agora. Ministérios e universidades parceiras publicam nos respetivos portais.",
      "news.empty.local":
        "Sem publicações locais para {country} por agora. Tente « Todos os países » ou outro país.",
      "news.cat.officiel": "Informação oficial",
      "news.cat.gouvernemental": "Governo",
      "news.cat.concours": "Concursos",
      "news.cat.opportunite": "Oportunidade",
      "news.cat.bourse": "Bolsa de estudos",
      "auth.connected": "Ligado",
      "auth.welcome.back": "Bem-vindo de volta, <strong>{name}</strong> — sessão ativa",
      "auth.logout.action": "Sair",
      "roles.label": "Para quem?",
      "roles.title": "Uma plataforma para toda a comunidade universitária",
      "roles.desc":
        "Cada ator acede a um espaço dedicado com informações verificadas pela universidade, para mais transparência e menos papelada.",
      "roles.student.title": "Estudantes",
      "roles.student.desc": "Consulte o seu percurso académico e administrativo na sua conta.",
      "roles.student.l1": "Notas e históricos",
      "roles.student.l2": "Propinas pagas e faturas pendentes",
      "roles.student.l3": "Horário e exames",
      "roles.student.l4": "Documentos oficiais (atestados, certificados)",
      "roles.prof.title": "Professores",
      "roles.prof.desc": "Gira os seus cursos e comunique com estudantes e administração.",
      "roles.prof.l1": "Introdução e publicação de notas",
      "roles.prof.l2": "Listas de estudantes por curso",
      "roles.prof.l3": "Calendário de avaliações",
      "roles.prof.l4": "Mensagens da faculdade",
      "roles.assistant.title": "Assistentes",
      "roles.assistant.desc":
        "Apoie a administração universitária e facilite o percurso dos estudantes.",
      "roles.assistant.l1": "Processamento de dossiers e inscrições",
      "roles.assistant.l2": "Acompanhamento de propinas e pagamentos",
      "roles.assistant.l3": "Emissão de atestados e documentos",
      "roles.assistant.l4": "Acolhimento e orientação no campus",
      "roles.uni.title": "Universidades",
      "roles.uni.desc": "Pilote o campus e difunda informações fiáveis à comunidade.",
      "roles.uni.l1": "Gestão de inscrições e propinas",
      "roles.uni.l2": "Painel administrativo",
      "roles.uni.l3": "Anúncios e notícias do campus",
      "roles.uni.l4": "Estatísticas e relatórios",
      "roles.uni.cta": "Portal admin campus",
      "features.label": "Ecossistema completo",
      "features.title": "10 pilares que nos diferenciam",
      "features.desc":
        "Rede nacional unificada com controlo JWT, registo de auditoria, filtragem por universidade e verificação criptográfica de diplomas.",
      "features.p1.title": "Sistema unificado multi-universidades",
      "features.p1.text":
        "Portal nacional: cada campus mantém autonomia partilhando padrões, tarifas e anúncios nacionais.",
      "features.p1.tag": "Rede SAC",
      "features.p2.title": "Inscrição online",
      "features.p2.text":
        "Dossier digital, escolha de instituição, secções e pagamento inicial com validação assistente / universidade.",
      "features.p2.tag": "Seguro",
      "features.p3.title": "Resultados académicos",
      "features.p3.text":
        "Notas por semestre inseridas pelos professores, médias calculadas e estado Aprovado / Recuperação.",
      "features.p3.tag": "Disponível",
      "features.p4.title": "Pagamento de propinas",
      "features.p4.text":
        "Transferência bancária parceira, acompanhamento de trimestres e validação antes do acesso completo.",
      "features.p4.tag": "Banco · USD/CDF",
      "features.p5.title": "Biblioteca digital",
      "features.p5.text":
        "Livros oficiais publicados pelo Ministério, consulta online para utilizadores autenticados.",
      "features.p5.tag": "Nacional",
      "features.p6.title": "IA de orientação académica",
      "features.p6.text":
        "Conselhos de percurso, competências e estágios por área e nível.",
      "features.p6.tag": "Disponível",
      "features.p7.title": "Estágios e empregos",
      "features.p7.text": "Ofertas de campus e nacionais publicadas por universidades e parceiros.",
      "features.p7.tag": "Disponível",
      "features.p8.title": "Rede social estudantil",
      "features.p8.text":
        "Feed de campus moderado, gostos e audiência por área — sem sair do ecossistema oficial.",
      "features.p8.tag": "Disponível",
      "features.p9.title": "Reuniões institucionais",
      "features.p9.text":
        "Chefe de secção ↔ professores, decano ↔ chefes — vídeo, votos, documentos e ata IA.",
      "features.p9.tag": "Governação",
      "features.p10.title": "Cursos online e ao vivo",
      "features.p10.text":
        "Catálogo MOOC do campus, inscrição online e sessões ao vivo (vídeo, chat, partilha de ecrã).",
      "features.p10.tag": "Disponível",
      "features.p11.title": "Verificação oficial de diplomas",
      "features.p11.text":
        "Número único, código de verificação e assinatura HMAC — página pública para empregadores.",
      "features.p11.tag": "Disponível",
      "features.p11.link": "Verificar um diploma →",
      "cta.title": "Junte-se ao Evo-smartUni",
      "cta.desc":
        "Registe-se como estudante, professor ou assistente para aceder a todas as informações online.",
      "cta.partner": 'Universidade parceira? <a href="admin-uni/" style="color:#fff;font-weight:600;text-decoration:underline;">Portal admin campus</a>',
      "footer.brand":
        "Plataforma de gestão académica e administrativa para universidades e institutos parceiros na África Central e na região.",
      "footer.platform": "Plataforma",
      "footer.official": "Notícias oficiais",
      "footer.account": "Conta",
      "footer.forgot": "Palavra-passe esquecida",
      "footer.payments": "Pagamentos",
      "footer.contact": "Contacto",
      "footer.universities": "Universidades (portal admin)",
      "footer.region": "África Central · Multi-país",
      "footer.rights": "© 2026 Evo-smartUni. Todos os direitos reservados.",
      "footer.legal": "Privacidade · Termos de utilização",
      "welcome": "Bem-vindo, {name}!",
      "meta.index.title": "Evo-smartUni",
      "meta.index.desc":
        "Evo-smartUni — Plataforma académica fiável para universidades, estudantes e professores.",
      "meta.login.title": "Entrar — Evo-smartUni",
      "theme.toggle": "Alternar modo claro / escuro",
    },
    es: {
      "lang.choose": "Idioma",
      "lang.switch": "Cambiar idioma",
      "nav.home": "Inicio",
      "nav.news": "Noticias",
      "nav.roles": "¿Quién lo usa?",
      "nav.library": "Biblioteca Digital",
      "nav.verify": "Verificar diploma",
      "nav.features": "Funciones",
      "nav.contact": "Contacto",
      "nav.login": "Iniciar sesión",
      "nav.signup": "Registrarse",
      "nav.myspace": "Mi espacio",
      "nav.logout": "Cerrar sesión",
      "nav.menu": "Abrir menú",
      "auth.back": "Volver al inicio",
      "auth.hero.title": "Inicia sesión en tu espacio",
      "auth.hero.lead":
        "Primero elige tu perfil — estudiante, profesor, asistente o jefe de sección — luego introduce tus credenciales para acceder a tu información oficial.",
      "auth.step1.title": "Selecciona tu perfil",
      "auth.step1.desc": "Estudiante, profesor, asistente o sección",
      "auth.step2.title": "Introduce tus credenciales",
      "auth.step2.desc": "Matrícula o correo institucional",
      "auth.step3.title": "Accede a tu panel",
      "auth.step3.desc": "Notas, tasas, cursos o administración del campus",
      "auth.card.title": "Iniciar sesión",
      "auth.card.subtitle": "Selecciona el tipo de cuenta para continuar",
      "auth.role.label": "Inicio sesión como",
      "auth.role.student": "Estudiante",
      "auth.role.prof": "Profesor",
      "auth.role.assistant": "Asistente",
      "auth.role.section": "Sección",
      "auth.role.badge.student": "Espacio estudiante",
      "auth.role.badge.prof": "Espacio profesor",
      "auth.role.badge.assistant": "Espacio asistente",
      "auth.role.badge.section": "Espacio jefe de sección",
      "hero.badge": "Ecosistema académico unificado — África Central y más allá",
      "hero.title": 'Un solo sistema para todas las <span>universidades</span> e institutos asociados',
      "hero.text":
        "Inscripción en línea, resultados, pago de tasas, biblioteca digital, orientación IA, prácticas y empleos, red estudiantil, cursos en línea y verificación oficial de diplomas — con seguridad por campus y rol.",
      "hero.create": "Crear cuenta",
      "hero.connect": "Iniciar sesión",
      "hero.stat.unis": "Universidades asociadas",
      "hero.stat.students": "Estudiantes inscritos",
      "hero.stat.access": "Acceso a tus datos",
      "hero.badge.live": "🔴 Clases en directo",
      "hero.badge.video": "🎥 Reuniones en vídeo",
      "hero.card.avg": "Promedio general",
      "hero.card.fees": "Tasas pagadas",
      "showcase.label": "Enseñanza conectada",
      "showcase.title": "Clases en directo y reuniones institucionales",
      "showcase.desc":
        "Vídeo en vivo, pantalla compartida, chat, grabaciones y actas IA — para clases, reuniones de sección y consejos de facultad.",
      "showcase.c1.tag": "Clase en directo",
      "showcase.c1.title": "Enseñanza en vivo",
      "showcase.c1.text":
        "El profesor imparte la sesión en vídeo. Los estudiantes se unen, preguntan y revisan la grabación.",
      "showcase.c2.tag": "Reuniones",
      "showcase.c2.title": "Videoconferencia",
      "showcase.c2.text":
        "Jefe de sección, profesores y dirección se reúnen en línea — votos, documentos y resumen IA.",
      "showcase.c3.tag": "Colaboración",
      "showcase.c3.title": "Aula internacional",
      "showcase.c3.text":
        "Intercambios multipaís, estadísticas académicas y gobernanza conectada en un mismo ecosistema.",
      "showcase.cta": "Acceder a la Biblioteca Digital",
      "news.label": "Información oficial",
      "news.title": "Noticias, concursos, becas y oportunidades",
      "news.desc":
        'Elige tu <strong>país</strong> para mostrar solo información local: ministerio, concursos, becas, oportunidades y anuncios del campus. Filtra también por <strong>categoría</strong> e <strong>institución</strong>.',
      "news.country": "País / territorio",
      "news.country.aria": "Elegir un país africano",
      "news.filter.aria": "Filtrar por categoría",
      "news.uni.all": "🏛️ Todas las instituciones del país",
      "news.uni.aria": "Filtrar por institución",
      "news.empty":
        "Sin publicaciones por ahora. El Ministerio y las universidades asociadas publican desde sus portales.",
      "news.portals":
        'Ministerio: <a href="ministere/" style="color:var(--primary);font-weight:600;">Portal MESU</a> · Universidad: <a href="admin-uni/" style="color:var(--primary);font-weight:600;">Portal campus</a>',
      "news.all": "Todas",
      "news.hint.all": "Mostrando todas las publicaciones africanas por categoría.",
      "news.hint.local": "Información local solo para {country} — ministerio, concursos, becas y campus.",
      "news.empty.all":
        "Sin publicaciones por ahora. Ministerios y universidades asociadas publican desde sus portales.",
      "news.empty.local":
        "Sin publicaciones locales para {country} por ahora. Prueba « Todos los países » u otro país.",
      "news.cat.officiel": "Información oficial",
      "news.cat.gouvernemental": "Gobierno",
      "news.cat.concours": "Concursos",
      "news.cat.opportunite": "Oportunidad",
      "news.cat.bourse": "Beca de estudios",
      "auth.connected": "Conectado",
      "auth.welcome.back": "Bienvenido de nuevo, <strong>{name}</strong> — sesión activa",
      "auth.logout.action": "Cerrar sesión",
      "roles.label": "¿Para quién?",
      "roles.title": "Una plataforma para toda la comunidad universitaria",
      "roles.desc":
        "Cada actor accede a un espacio dedicado con información verificada por la universidad, para más transparencia y menos papeleo.",
      "roles.student.title": "Estudiantes",
      "roles.student.desc": "Consulta tu trayectoria académica y administrativa desde tu cuenta.",
      "roles.student.l1": "Notas y boletines",
      "roles.student.l2": "Tasas pagadas y facturas pendientes",
      "roles.student.l3": "Horario y exámenes",
      "roles.student.l4": "Documentos oficiales (certificados, constancias)",
      "roles.prof.title": "Profesores",
      "roles.prof.desc": "Gestiona tus cursos y comunícate con estudiantes y administración.",
      "roles.prof.l1": "Introducción y publicación de notas",
      "roles.prof.l2": "Listas de estudiantes por curso",
      "roles.prof.l3": "Calendario de evaluaciones",
      "roles.prof.l4": "Mensajes de la facultad",
      "roles.assistant.title": "Asistentes",
      "roles.assistant.desc":
        "Apoya la administración universitaria y facilita el día a día de los estudiantes.",
      "roles.assistant.l1": "Tramitación de expedientes e inscripciones",
      "roles.assistant.l2": "Seguimiento de tasas y pagos",
      "roles.assistant.l3": "Emisión de constancias y documentos",
      "roles.assistant.l4": "Acogida y orientación en el campus",
      "roles.uni.title": "Universidades",
      "roles.uni.desc": "Gestiona tu campus y difunde información fiable a la comunidad.",
      "roles.uni.l1": "Gestión de inscripciones y tasas",
      "roles.uni.l2": "Panel administrativo",
      "roles.uni.l3": "Anuncios y noticias del campus",
      "roles.uni.l4": "Estadísticas e informes",
      "roles.uni.cta": "Portal admin campus",
      "features.label": "Ecosistema completo",
      "features.title": "10 pilares que nos diferencian",
      "features.desc":
        "Red nacional unificada con control JWT, registro de auditoría, filtrado por universidad y verificación criptográfica de diplomas.",
      "features.p1.title": "Sistema unificado multi-universidades",
      "features.p1.text":
        "Portal nacional: cada campus mantiene autonomía compartiendo estándares, tarifas y anuncios nacionales.",
      "features.p1.tag": "Red SAC",
      "features.p2.title": "Inscripción en línea",
      "features.p2.text":
        "Expediente digital, elección de institución, secciones y pago inicial con validación asistente / universidad.",
      "features.p2.tag": "Seguro",
      "features.p3.title": "Resultados académicos",
      "features.p3.text":
        "Notas por semestre ingresadas por profesores, promedios calculados y estado Aprobado / Recuperación.",
      "features.p3.tag": "Disponible",
      "features.p4.title": "Pago de tasas",
      "features.p4.text":
        "Transferencia bancaria asociada, seguimiento de trimestres y validación antes del acceso completo.",
      "features.p4.tag": "Banco · USD/CDF",
      "features.p5.title": "Biblioteca digital",
      "features.p5.text":
        "Libros oficiales publicados por el Ministerio, consulta en línea para usuarios conectados.",
      "features.p5.tag": "Nacional",
      "features.p6.title": "IA de orientación académica",
      "features.p6.text":
        "Consejos de trayectoria, competencias y prácticas según carrera y nivel.",
      "features.p6.tag": "Disponible",
      "features.p7.title": "Prácticas y empleos",
      "features.p7.text": "Ofertas de campus y nacionales publicadas por universidades y socios.",
      "features.p7.tag": "Disponible",
      "features.p8.title": "Red social estudiantil",
      "features.p8.text":
        "Feed de campus moderado, likes y audiencia por carrera — sin salir del ecosistema oficial.",
      "features.p8.tag": "Disponible",
      "features.p9.title": "Reuniones institucionales",
      "features.p9.text":
        "Jefe de sección ↔ profesores, decano ↔ jefes — vídeo, votos, documentos y acta IA.",
      "features.p9.tag": "Gobernanza",
      "features.p10.title": "Cursos en línea y en directo",
      "features.p10.text":
        "Catálogo MOOC del campus, inscripción en línea y sesiones en vivo (vídeo, chat, pantalla compartida).",
      "features.p10.tag": "Disponible",
      "features.p11.title": "Verificación oficial de diplomas",
      "features.p11.text":
        "Número único, código de verificación y firma HMAC — página pública para empleadores.",
      "features.p11.tag": "Disponible",
      "features.p11.link": "Verificar un diploma →",
      "cta.title": "Únete a Evo-smartUni",
      "cta.desc":
        "Regístrate como estudiante, profesor o asistente para acceder a toda tu información en línea.",
      "cta.partner": '¿Universidad asociada? <a href="admin-uni/" style="color:#fff;font-weight:600;text-decoration:underline;">Portal admin campus</a>',
      "footer.brand":
        "Plataforma de gestión académica y administrativa para universidades e institutos asociados en África Central y la región.",
      "footer.platform": "Plataforma",
      "footer.official": "Noticias oficiales",
      "footer.account": "Cuenta",
      "footer.forgot": "Contraseña olvidada",
      "footer.payments": "Pagos",
      "footer.contact": "Contacto",
      "footer.universities": "Universidades (portal admin)",
      "footer.region": "África Central · Multi-país",
      "footer.rights": "© 2026 Evo-smartUni. Todos los derechos reservados.",
      "footer.legal": "Privacidad · Términos de uso",
      "welcome": "¡Bienvenido, {name}!",
      "meta.index.title": "Evo-smartUni",
      "meta.index.desc":
        "Evo-smartUni — Plataforma académica fiable para universidades, estudiantes y profesores.",
      "meta.login.title": "Iniciar sesión — Evo-smartUni",
      "theme.toggle": "Alternar modo claro / oscuro",
    },
  };

  let currentLang = "fr";
  let switcherEl = null;
  let autoTextMap = {};
  let autoPlaceholderMap = {};
  let autoObserverStarted = false;
  let autoObserverTimer = null;

  function mergeDict(ext) {
    if (!ext) return;
    Object.keys(ext).forEach((lang) => {
      if (!DICT[lang]) DICT[lang] = {};
      Object.assign(DICT[lang], ext[lang]);
    });
  }

  function registerPlatform(extDict, textMap, placeholderMap) {
    mergeDict(extDict);
    if (textMap) Object.assign(autoTextMap, textMap);
    if (placeholderMap) Object.assign(autoPlaceholderMap, placeholderMap);
    if (switcherEl) apply();
  }

  function labelCoreText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(".hint").forEach((h) => h.remove());
    return clone.textContent.trim().replace(/\s+/g, " ");
  }

  function setAutoTranslatedText(el, translated) {
    if (el.tagName === "LABEL" && el.querySelector(".hint")) {
      const hint = el.querySelector(".hint");
      while (el.firstChild && el.firstChild !== hint) {
        el.removeChild(el.firstChild);
      }
      el.insertBefore(document.createTextNode(translated + " "), hint);
      return;
    }
    if (el.querySelector("[data-i18n], [data-i18n-html]")) return;
    el.textContent = translated;
  }

  function applyAutoTranslate() {
    const skip = "script, style, noscript, .lang-switcher";
    const selectors =
      "button, a, label, h1, h2, h3, h4, h5, h6, legend, option, small, .nav-tab, .side-btn, .badge-role, .panel__head h2, .auth-card__title, .auth-card__subtitle, .kpi span, .lib-cat-filter__label, .form-footer, .header__link, .auth-header__link span:last-child, .auth-role-label, .auth-step-num + div strong, .auth-step-num + div span";

    document.querySelectorAll(selectors).forEach((el) => {
      if (el.closest(skip)) return;
      if (el.hasAttribute("data-i18n") || el.hasAttribute("data-i18n-html")) return;
      if (el.id === "userName" || el.id === "profileFullName" || el.id === "platformHeroTitle" || el.id === "platformHeroDesc") return;
      if (el.closest("#headerActions")) return;
      if (el.querySelector("[data-i18n], [data-i18n-html]")) return;

      let key = el.getAttribute("data-i18n-auto");
      if (!key) {
        const text =
          el.tagName === "LABEL" && el.querySelector(".hint")
            ? labelCoreText(el)
            : el.textContent.trim().replace(/\s+/g, " ");
        key = autoTextMap[text];
        if (!key) return;
        el.setAttribute("data-i18n-auto", key);
      }
      const translated = t(key);
      const current =
        el.tagName === "LABEL" && el.querySelector(".hint")
          ? labelCoreText(el)
          : el.textContent.trim().replace(/\s+/g, " ");
      if (current !== translated) setAutoTranslatedText(el, translated);
    });

    document.querySelectorAll("[placeholder]").forEach((el) => {
      if (el.closest(skip)) return;
      let key = el.getAttribute("data-i18n-ph");
      if (!key) {
        const ph = el.getAttribute("placeholder");
        key = autoPlaceholderMap[ph];
        if (!key) return;
        el.setAttribute("data-i18n-ph", key);
      }
      el.setAttribute("placeholder", t(key));
    });
  }

  function startAutoObserver() {
    if (autoObserverStarted || !document.body) return;
    autoObserverStarted = true;
    const obs = new MutationObserver(() => {
      clearTimeout(autoObserverTimer);
      autoObserverTimer = setTimeout(applyAutoTranslate, 200);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function getLangMeta(code) {
    return LANGS.find((l) => l.code === code) || LANGS[0];
  }

  function getPreferred() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DICT[saved]) return saved;
    const nav = (navigator.language || "fr").slice(0, 2).toLowerCase();
    if (DICT[nav]) return nav;
    return "fr";
  }

  function t(key, vars) {
    const pack = DICT[currentLang] || DICT.fr;
    let str = pack[key] != null ? pack[key] : (DICT.fr[key] != null ? DICT.fr[key] : key);
    if (vars) {
      Object.keys(vars).forEach((k) => {
        str = str.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
      });
    }
    return str;
  }

  function apply() {
    const meta = getLangMeta(currentLang);
    document.documentElement.lang = currentLang;
    document.documentElement.dir = meta.dir || "ltr";

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      el.textContent = t(key);
    });

    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const key = el.getAttribute("data-i18n-html");
      if (!key) return;
      el.innerHTML = t(key);
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (!key) return;
      el.setAttribute("placeholder", t(key));
    });

    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria");
      if (!key) return;
      el.setAttribute("aria-label", t(key));
    });

    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      if (!key) return;
      el.setAttribute("title", t(key));
    });

    const titleEl = document.querySelector("title[data-i18n]");
    if (titleEl) {
      document.title = t(titleEl.getAttribute("data-i18n"));
    }

    const descMeta = document.querySelector('meta[name="description"][data-i18n]');
    if (descMeta) {
      descMeta.setAttribute("content", t(descMeta.getAttribute("data-i18n")));
    }

    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.title = t("theme.toggle");
      btn.setAttribute("aria-label", t("theme.toggle"));
    });

    applyAutoTranslate();

    if (switcherEl) {
      switcherEl.querySelectorAll(".lang-switcher__option").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.lang === currentLang);
      });
    }

    window.dispatchEvent(new CustomEvent("sac:lang-change", { detail: { lang: currentLang } }));
  }

  function setLang(code) {
    if (!DICT[code]) return;
    currentLang = code;
    localStorage.setItem(STORAGE_KEY, code);
    apply();
  }

  function buildSwitcher() {
    if (switcherEl || document.querySelector(".lang-switcher")) {
      switcherEl = document.querySelector(".lang-switcher");
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "lang-switcher";
    wrap.innerHTML =
      '<button type="button" class="lang-switcher__btn" aria-haspopup="true" aria-expanded="false" title="' +
      t("lang.switch") +
      '">🌐</button>' +
      '<div class="lang-switcher__panel" role="menu">' +
      '<div class="lang-switcher__title">' +
      t("lang.choose") +
      "</div>" +
      LANGS.map(
        (l) =>
          '<button type="button" class="lang-switcher__option' +
          (l.code === currentLang ? " is-active" : "") +
          '" data-lang="' +
          l.code +
          '" role="menuitem"><span class="lang-switcher__flag">' +
          l.flag +
          '</span><span class="lang-switcher__label">' +
          l.label +
          "</span></button>"
      ).join("") +
      "</div>";

    document.body.appendChild(wrap);
    switcherEl = wrap;

    const btn = wrap.querySelector(".lang-switcher__btn");
    const panel = wrap.querySelector(".lang-switcher__panel");

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = wrap.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    panel.querySelectorAll(".lang-switcher__option").forEach((opt) => {
      opt.addEventListener("click", () => {
        setLang(opt.dataset.lang);
        wrap.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
      });
    });

    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) {
        wrap.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
      }
    });

    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY && e.newValue && DICT[e.newValue]) {
        currentLang = e.newValue;
        apply();
      }
    });
  }

  function init() {
    currentLang = getPreferred();
    buildSwitcher();
    apply();
    startAutoObserver();
  }

  window.SAC_I18N = {
    t,
    setLang,
    apply,
    getLang: () => currentLang,
    init,
    LANGS,
    mergeDict,
    registerPlatform,
  };

  window.SAC_TX = function (key, fallback, vars) {
    if (typeof fallback === "object" && fallback !== null && vars === undefined) {
      vars = fallback;
      fallback = undefined;
    }
    if (window.SAC_I18N) return SAC_I18N.t(key, vars);
    return fallback != null ? fallback : key;
  };
})();
