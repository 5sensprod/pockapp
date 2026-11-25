package backend

import "sync"

// VerrouOuvertureSession sérialise « chercher une session ouverte, puis en
// créer une » (SessionDuJour, POST /api/cash/session/open). Sans lui, deux
// postes qui encaissent au même instant en début de journée pouvaient créer
// DEUX sessions ouvertes — et la clôture, qui refuse d'avancer tant qu'une
// autre session reste ouverte, devenait impossible.
//
// Tous les postes (application bureau et navigateurs) parlent au MÊME processus
// PocketBase : un verrou de processus suffit. L'index unique de la migration
// AddUniqueOpenSessionIndex est la ceinture sous cette bretelle.
var VerrouOuvertureSession sync.Mutex
