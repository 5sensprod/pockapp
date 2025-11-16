// Endpoint pour vérifier l'accès à un module spécifique
routerAdd("GET", "/api/check-module-access/:moduleId", (c) => {
  const authRecord = c.get("authRecord")
  
  if (!authRecord) {
    return c.json(401, { 
      error: "Authentication required",
      hasAccess: false 
    })
  }
  
  const moduleId = c.pathParam("moduleId")
  const userRole = authRecord.get("role") || "user"
  
  try {
    const moduleAccess = $app.dao().findFirstRecordByFilter(
      "module_access",
      "module_id = {:moduleId} && enabled = true",
      { moduleId: moduleId }
    )
    
    if (!moduleAccess) {
      // Module sans restriction = accessible à tous
      return c.json(200, { 
        hasAccess: true,
        userRole: userRole,
        moduleId: moduleId,
        requiresPermission: false
      })
    }
    
    const requiredRoles = moduleAccess.get("required_roles")
    const hasAccess = requiredRoles.includes(userRole)
    
    return c.json(200, {
      hasAccess: hasAccess,
      userRole: userRole,
      requiredRoles: requiredRoles,
      moduleId: moduleId,
      requiresPermission: true
    })
    
  } catch (e) {
    return c.json(500, { 
      error: "Failed to check access",
      hasAccess: false 
    })
  }
}, $apis.requireRecordAuth())

// Endpoint pour récupérer tous les modules accessibles
routerAdd("GET", "/api/accessible-modules", (c) => {
  const authRecord = c.get("authRecord")
  
  if (!authRecord) {
    return c.json(401, { error: "Authentication required" })
  }
  
  const userRole = authRecord.get("role") || "user"
  
  try {
    const allModules = $app.dao().findRecordsByFilter(
      "module_access",
      "enabled = true",
      "-created",
      500
    )
    
    const accessible = []
    const restricted = []
    
    allModules.forEach((module) => {
      const moduleId = module.get("module_id")
      const requiredRoles = module.get("required_roles")
      
      const moduleData = {
        moduleId: moduleId,
        requiredRoles: requiredRoles
      }
      
      if (requiredRoles.includes(userRole)) {
        accessible.push(moduleData)
      } else {
        restricted.push(moduleData)
      }
    })
    
    return c.json(200, {
      userRole: userRole,
      accessibleModules: accessible,
      restrictedModules: restricted
    })
  } catch (e) {
    return c.json(500, { error: "Failed to fetch modules" })
  }
}, $apis.requireRecordAuth())