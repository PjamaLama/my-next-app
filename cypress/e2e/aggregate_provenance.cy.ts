/// <reference types="cypress" />
describe('Aggregate provenance smoke', () => {
  it('asks for total sales and shows provenance and numeric result', () => {
    cy.visit('/');
    cy.get('textarea, [contenteditable="true"], input[type="text"]').first().type('what is the total of all my sales made?{enter}');
    // Wait for assistant message that includes provenance hints
    cy.contains(/Total .*? = /i, { timeout: 30000 }).should('be.visible');
    // Presence of provenance phrasing
    cy.contains(/computed from \d+ row\(s\)/i).should('be.visible');
  });
});


