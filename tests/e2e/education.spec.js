// Garantit : un formateur crée un cours et une leçon depuis son espace ; un élève entre dans l'Espace Éducation
// (son essai gratuit de 7 jours démarre), trouve le cours, s'y inscrit gratuitement pendant l'essai et voit la leçon.
//
// État préparé hors interface (actions d'administration, couvertes séparément par backoffice.spec) :
//   - le statut « formateur » du compte A (`user.isTrainer`), normalement accordé après validation d'une candidature ;
//   - l'activation du cours (`course.status = 'active'`), normalement faite par l'administration (« pending_review » → « active »).
import { test, expect } from '../support/fixtures.js';

async function openEducationHub(page) {
  await page.locator('.tab[data-screen="profile"]').click();
  await expect(page.locator('#screen-profile')).toHaveClass(/active/);
  await page.locator('#screen-profile [onclick="go(\'profile-menu\')"]').click();
  await expect(page.locator('#screen-profile-menu')).toHaveClass(/active/);
  await page.locator('#screen-profile-menu [onclick="enterEducationSpaceNormally()"]').click();
  await expect(page.locator('#screen-education-hub')).toHaveClass(/active/);
}

test.describe('Espace Éducation', () => {
  test('un formateur crée un cours et une leçon ; un élève s’inscrit pendant son essai de 7 jours', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Prof_Fatou');
    await suktum.dismissTour(a);

    // Statut formateur accordé (validation admin simulée).
    const fatou = (await suktum.storage.readJSON('user:Prof_Fatou'));
    await suktum.storage.writeJSON('user:Prof_Fatou', { ...fatou, isTrainer: true });

    // A entre dans l'Espace Éducation : son essai démarre, l'espace formateur est proposé.
    await openEducationHub(a);
    await expect(a.locator('#edu-trial-banner')).toContainText('Essai gratuit — 7 jour(s) restant(s)');
    expect((await suktum.storage.readJSON('user:Prof_Fatou')).eduTrialStartedAt).toBeTruthy();
    await a.locator('#education-trainer-status-card [onclick="go(\'trainer-dashboard\')"]').click();
    await expect(a.locator('#screen-trainer-dashboard')).toHaveClass(/active/);

    // A crée un cours → en attente de validation.
    await a.locator('#new-course-title').fill('Grammaire française niveau 1');
    await a.locator('#new-course-desc').fill('Les bases : nom, verbe, accord.');
    await a.locator('#new-course-price').fill('5000');
    await a.locator('#screen-trainer-dashboard button[onclick="createCourse()"]').click();
    await expect.poll(() => suktum.lastToast(a)).toBe('Cours envoyé pour validation avant publication ✓');
    const courseKey = (await suktum.storage.list(null, 'course:', true)).keys[0];
    const course = (await suktum.storage.readJSON(courseKey));
    expect(course).toMatchObject({ trainerUsername: 'Prof_Fatou', title: 'Grammaire française niveau 1', price: 5000, status: 'pending_review' });
    await expect(a.locator('#trainer-courses-list')).toContainText('En attente de validation');

    // Validation admin simulée, puis A ajoute une leçon.
    await suktum.storage.writeJSON(courseKey, { ...course, status: 'active' });
    await a.locator(`#trainer-courses-list [onclick="openManageCourse('${course.id}')"]`).click();
    await expect(a.locator('#screen-manage-course')).toHaveClass(/active/);
    await a.locator('#new-lesson-title').fill('Leçon 1 — Le nom');
    await a.locator('#new-lesson-content').fill('Le nom désigne une personne, un animal, une chose ou une idée.');
    await a.locator('#screen-manage-course button[onclick="addLessonToCourse()"]').click();
    await expect.poll(() => suktum.lastToast(a)).toBe('Leçon ajoutée ✓');
    const lessonKeys = (await suktum.storage.list(null, `lesson:${course.id}__`, true)).keys;
    expect(lessonKeys).toHaveLength(1);
    expect((await suktum.storage.readJSON(lessonKeys[0]))).toMatchObject({ courseId: course.id, title: 'Leçon 1 — Le nom', aiFlagged: false });
    await expect(a.locator('#manage-course-lessons')).toContainText('Leçon 1 — Le nom');

    // B (élève) entre dans l'Espace Éducation, trouve le cours et s'inscrit pendant son essai.
    const b = await suktum.openDevice('B');
    await suktum.signUp(b, 'Eleve_Ibou');
    await suktum.dismissTour(b);
    await openEducationHub(b);
    await expect(b.locator('#edu-trial-banner')).toContainText('Essai gratuit');
    await b.locator('#screen-education-hub [onclick="go(\'education-courses\')"]').click();
    await expect(b.locator('#screen-education-courses')).toHaveClass(/active/);
    await b.locator(`#screen-education-courses [onclick="openCourseDetail('${course.id}')"]`).click();
    await expect(b.locator('#screen-course-detail')).toHaveClass(/active/);
    await expect(b.locator('#course-detail-title')).toContainText('Grammaire française niveau 1');
    await expect(b.locator('#course-detail-content')).toContainText('Les bases : nom, verbe, accord.');
    await expect(b.locator('#course-detail-content')).toContainText('5 000 FCFA');
    await b.locator(`#course-detail-content button[onclick="enrollInCourse('${course.id}')"]`).click();
    await expect.poll(() => suktum.lastToast(b)).toBe('Accès gratuit pendant votre essai — profitez-en pour découvrir ce cours ✓');

    const enrollment = (await suktum.storage.readJSON(`enrollment:${course.id}__Eleve_Ibou`));
    expect(enrollment).toMatchObject({ courseId: course.id, studentUsername: 'Eleve_Ibou', trainerUsername: 'Prof_Fatou', status: 'approved', trialEnrollment: true });
    expect((await suktum.storage.readJSON('user:Eleve_Ibou'))).toMatchObject({ isStudent: true });

    // L'élève inscrit voit la leçon.
    await expect(b.locator('#course-detail-content')).toContainText('Leçon 1 — Le nom');
    await expect(b.locator('#course-detail-content')).toContainText('Le nom désigne une personne');

    expect(suktum.errors).toEqual([]);
  });
});
