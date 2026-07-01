/**
 * Activité pédagogique — espace professeur (aligné sur le tableau de bord assistant)
 */
const EVOSU_PROFESSOR = (function () {
  function getSemester() {
    return EVOSU_GRADES?.CURRENT_SEMESTER || "s1-2025";
  }

  function getClasses(session) {
    return EVOSU_COURSES.getTeachingClasses(session);
  }

  function studentNeedsGrade(student, existingGrades) {
    return !existingGrades.some((x) => x.studentEmail === student.email);
  }

  function getCoursesWithPendingGrades(session, semester) {
    semester = semester || getSemester();
    const profEmail = session?.identifiant || "";
    return getClasses(session)
      .map((courseClass, idx) => {
        const students = EVOSU_GRADES.getStudentsForClass(courseClass);
        const existing = EVOSU_GRADES.getForProfessorCourse(
          profEmail,
          courseClass,
          semester
        );
        const pending = students.filter((s) => studentNeedsGrade(s, existing));
        const stats = EVOSU_GRADES.getCourseStats(profEmail, courseClass, semester);
        return {
          idx,
          courseClass,
          students,
          pending,
          pendingCount: pending.length,
          gradedCount: stats.gradedCount,
          studentCount: stats.studentCount,
          classAverage: stats.classAverage,
        };
      })
      .filter((c) => c.studentCount > 0 && c.pendingCount > 0);
  }

  function getPublicationsWithEngagement(session) {
    return EVOSU_DATA.getPublicationsByAuthor(session).map((doc) => {
      const counts = EVOSU_DATA.reactionCounts(doc);
      return {
        doc,
        counts,
        totalReact: counts.useful + counts.question + counts.thanks,
        hasQuestion: counts.question > 0,
      };
    });
  }

  function getPublicationsNeedingAttention(session) {
    return getPublicationsWithEngagement(session).filter(
      (p) => p.hasQuestion || p.counts.thanks > 0
    );
  }

  function getStudentsByClass(session) {
    return getClasses(session).map((courseClass, idx) => ({
      idx,
      courseClass,
      students: EVOSU_GRADES.getStudentsForClass(courseClass),
    }));
  }

  function getAccountStatus(session) {
    const users = EVOSU_IDENTITY.getLocalUsers();
    const found = users.find(
      (u) => u.role === "professeur" && u.email === session?.identifiant
    );
    const payment = found?.payment || session?.payment;
    return {
      paymentStatus: payment?.status || "none",
      payment,
      inscriptionFee: found?.inscriptionFee || session?.inscriptionFee,
      verified: payment?.status === "verified",
      pending: payment?.status === "pending_verification",
      rejected: payment?.status === "rejected",
    };
  }

  function getSummary(session, semester) {
    semester = semester || getSemester();
    const classes = getClasses(session);
    const pendingCourses = getCoursesWithPendingGrades(session, semester);
    const pendingGrades = pendingCourses.reduce((s, c) => s + c.pendingCount, 0);
    const docs = EVOSU_DATA.getPublicationsByAuthor(session);
    let react = 0;
    let questions = 0;
    docs.forEach((d) => {
      const c = EVOSU_DATA.reactionCounts(d);
      react += c.useful + c.question + c.thanks;
      questions += c.question;
    });
    const account = getAccountStatus(session);

    return {
      coursesCount: classes.length,
      studentsCount: EVOSU_GRADES.countStudentsForProfessor(session),
      publicationsCount: docs.length,
      gradesEntered: EVOSU_GRADES.countGradesForProfessor(session.identifiant),
      pendingGrades,
      pendingCoursesCount: pendingCourses.length,
      reactionsTotal: react,
      questionsCount: questions,
      attentionPublications: getPublicationsNeedingAttention(session).length,
      accountPending: account.pending,
      accountVerified: account.verified,
      totalPriority:
        pendingGrades +
        questions +
        (account.pending ? 1 : 0) +
        (classes.length === 0 ? 1 : 0),
    };
  }

  function displayName(user) {
    if (typeof EVOSU_IDENTITY !== "undefined") {
      return EVOSU_IDENTITY.formatFullName(user.prenom, user.nom) || user.email;
    }
    return [user.prenom, user.nom].filter(Boolean).join(" ") || user.email;
  }

  return {
    getSemester,
    getClasses,
    getSummary,
    getCoursesWithPendingGrades,
    getPublicationsWithEngagement,
    getPublicationsNeedingAttention,
    getStudentsByClass,
    getAccountStatus,
    displayName,
  };
})();
