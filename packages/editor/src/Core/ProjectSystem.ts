import { UMeshComponent, UAssetManager, EventBus } from '@game-creator/engine';
import { EditorLogger } from './EditorLogger';

/**
 * Static class to manage the project lifecycle using the File System Access API.
 */
export class ProjectSystem {
  public static directoryHandle: FileSystemDirectoryHandle | null = null;
  public static projectName: string = 'Untitled Project';
  public static hasUnsavedChanges: boolean = false;
  public static dirtyMaterials: Map<string, any> = new Map();
  private static autoSaveInterval: any = null;

  public static markUnsaved() {
    if (!this.hasUnsavedChanges) {
      this.hasUnsavedChanges = true;
      document.title = `* Game Creator - ${this.projectName || 'Untitled'}`;
    }
  }

  public static clearUnsaved() {
    this.hasUnsavedChanges = false;
    this.dirtyMaterials.clear();
    document.title = `Game Creator - ${this.projectName || 'Untitled'}`;
  }

  public static markMaterialDirty(fileName: string, data: any) {
    this.dirtyMaterials.set(fileName, data);
    this.markUnsaved();
  }

  public static startAutoSave() {
    if (this.autoSaveInterval) clearInterval(this.autoSaveInterval);

    // 10 minutes = 600,000 milisegundos
    this.autoSaveInterval = setInterval(async () => {
      if (this.hasUnsavedChanges && this.directoryHandle) {
        EditorLogger.info("Iniciando Auto-Save de 10 minutos...");
        EventBus.dispatch('RequestSaveProject', {});
      }
    }, 600000);
  }

  /**
   * Returns the current project directory handle.
   */
  public static getDirectoryHandle(): FileSystemDirectoryHandle | null {
    return this.directoryHandle;
  }

  /**
   * Creates a new project structure in a user-selected directory.
   */
  public static async createProject(): Promise<boolean> {
    try {
      const handle = await (window as any).showDirectoryPicker({
        mode: 'readwrite'
      });

      if (!handle) return false;

      // 1. Strict Validation: Must be absolutely empty
      if (!await this.validateDirectoryForNew(handle)) {
        alert('Error: La carpeta debe estar completamente vacía para crear un nuevo proyecto.');
        return false;
      }

      this.directoryHandle = handle;
      this.projectName = handle.name;
      document.title = `Game Creator - ${this.projectName}`;

      UAssetManager.getInstance().reset(handle);
      EventBus.dispatch('PROJECT_LOADED', { handle: handle });
      EventBus.emit('RequestContentBrowserRefresh', {});

      // Iniciar el auto-save (Phase 56)
      this.startAutoSave();

      // 2. Base Structure Creation
      await handle.getDirectoryHandle('Assets', { create: true });
      await handle.getDirectoryHandle('Saved', { create: true });

      // 3. Project Manifest Creation
      const projectFileHandle = await handle.getFileHandle('project.gc', { create: true });
      const writable = await (projectFileHandle as any).createWritable();
      await writable.write(JSON.stringify({
        projectName: this.projectName,
        startLevel: "main.gmap",
        engineVersion: "0.1",
        created: new Date().toISOString()
      }, null, 2));
      await writable.close();

      // 4. Initial Level Creation
      const mapsDir = await handle.getDirectoryHandle('Maps', { create: true });
      const levelFileHandle = await mapsDir.getFileHandle('main.gmap', { create: true });
      const levelWritable = await (levelFileHandle as any).createWritable();
      const defaultLevel = {
        actors: [
          {
            name: "DirectionalLight",
            components: [
              { type: "UTransformComponent", relativeLocation: [10, 20, 10], relativeRotation: [-45, 45, 0], relativeScale: [1, 1, 1] },
              { type: "UDirectionalLightComponent", intensity: 5.0, color: [1, 1, 1, 1], castShadows: true }
            ]
          }
        ]
      };
      await levelWritable.write(JSON.stringify(defaultLevel, null, 2));
      await levelWritable.close();

      EditorLogger.info(`Project created: ${this.projectName}`);
      this.clearUnsaved();
      return true;
    } catch (error) {
      EditorLogger.error('Failed to create project:', error);
      return false;
    }
  }

  private static async validateDirectoryForNew(handle: FileSystemDirectoryHandle): Promise<boolean> {
    // If we enter the loop even once, it's not empty
    for await (const _ of (handle as any).values()) {
      return false;
    }
    return true;
  }

  private static async validateDirectoryForOpen(handle: FileSystemDirectoryHandle): Promise<boolean> {
    try {
      // Look for manifest or scene file
      try {
        await handle.getFileHandle('project.gc');
        return true;
      } catch {
        // Legacy support
        await handle.getFileHandle('Project.gproj').catch(() => null);
        await handle.getFileHandle('Scene.json');
        return true;
      }
    } catch {
      return false;
    }
  }

  /**
   * Saves the current experimental world state to the project directory.
   */
  public static async saveProject(world: any): Promise<void> {
    if (!this.directoryHandle) {
      EditorLogger.warn('Cannot save project: No project open.');
      return;
    }

    try {
      // 1. Save Project Metadata (project.gc)
      const projectData = {
        projectName: this.projectName,
        startLevel: "main.gmap", // Hardcoded for now, will be dynamic later
        engineVersion: "0.1"
      };
      const projectFileHandle = await this.directoryHandle.getFileHandle('project.gc', { create: true });
      const projectWritable = await (projectFileHandle as any).createWritable();
      await projectWritable.write(JSON.stringify(projectData, null, 2));
      await projectWritable.close();

      // 2. Save Active Level (into Maps folder)
      const mapsDir = await this.directoryHandle.getDirectoryHandle('Maps', { create: true });
      const worldData = world.serialize();
      const levelFileHandle = await mapsDir.getFileHandle('main.gmap', { create: true });
      const levelWritable = await (levelFileHandle as any).createWritable();
      await levelWritable.write(JSON.stringify(worldData, null, 2));
      await levelWritable.close();

      // 3. Save all dirty materials
      for (const [matName, matData] of this.dirtyMaterials.entries()) {
        await this.saveMaterialData(matName, matData);
      }

      EditorLogger.info(`Project saved: ${this.projectName}`);
      this.clearUnsaved();
      this.startAutoSave();
    } catch (error) {
      EditorLogger.error('Failed to save project:', error);
    }
  }

  /**
   * Loads an existing project from a user-selected directory.
   */
  public static async loadProject(engine: any): Promise<void> {
    try {
      const handle = await (window as any).showDirectoryPicker({
        mode: 'readwrite'
      });

      if (!handle) return;

      // Strict Validation: Must have a project file
      if (!await this.validateDirectoryForOpen(handle)) {
        alert('Error: No se encontró un proyecto válido en esta carpeta (Falta Scene.json o Project.gproj).');
        return;
      }

      this.directoryHandle = handle;
      this.projectName = handle.name;
      document.title = `Game Creator - ${this.projectName}`;

      UAssetManager.getInstance().reset(handle);

      // Emitimos que se cargó el proyecto ANTES de instanciar los actores
      EventBus.dispatch('PROJECT_LOADED', { handle: handle });
      EventBus.emit('RequestContentBrowserRefresh', {});

      // ÚNICO BLOQUE DE CARGA DE ESCENA (El optimizado)
      if (engine) {
        try {
          let sceneData: any = null;

          try {
            // New format: project.gc + Maps/main.gmap
            const projectFileHandle = await handle.getFileHandle('project.gc', { create: false });
            const pFile = await projectFileHandle.getFile();
            const pText = await pFile.text();
            const pData = JSON.parse(pText);

            const mapsDir = await handle.getDirectoryHandle('Maps');
            const levelFileHandle = await mapsDir.getFileHandle(pData.startLevel || 'main.gmap');
            const lFile = await levelFileHandle.getFile();
            const lText = await lFile.text();
            sceneData = JSON.parse(lText);
          } catch (err) {
            // Legacy format fallback: Scene.json
            const sceneFileHandle = await handle.getFileHandle('Scene.json', { create: false });
            const file = await sceneFileHandle.getFile();
            const text = await file.text();
            sceneData = JSON.parse(text);
          }

          const world = engine.getActiveWorld();
          if (!world) return;

          const device = engine.getRenderer().getDevice();

          await world.deserialize(sceneData);

          // OPTIMIZACIÓN: Crear un array de Promesas para procesar a todos los actores a la vez
          const loadPromises = world.actors.map(async (actor: any) => {
            const meshComp = actor.getComponent(UMeshComponent);
            if (meshComp) {
              // Usamos geometryType en lugar del nombre del actor
              if (meshComp.geometryType === 'box') meshComp.createBox(device);
              else if (meshComp.geometryType === 'sphere') meshComp.createSphere(device, 1.0, 32);
              else if (meshComp.geometryType === 'plane') meshComp.createPlane(device, 2.0, 10);
              else if (meshComp.geometryType === 'cylinder') meshComp.createCylinder(device, 1.0, 2.0, 32);
              else if (meshComp.geometryType === 'capsule') meshComp.createCapsule(device, 0.5, 2.0, 32, 16);

              // Carga de material asíncrona no bloqueante
              if (meshComp.materialPath) {
                const material = await UAssetManager.getInstance().loadMaterial(meshComp.materialPath, device);
                if (material) meshComp.material = material;
              } else if (meshComp.material && typeof meshComp.material.updateResources === 'function') {
                await meshComp.material.updateResources(device, UAssetManager.getInstance());
              }
            }
          });

          // Ejecutar toda la carga en paralelo (Aceleración masiva de arranque)
          await Promise.all(loadPromises);

        } catch (e) {
          EditorLogger.warn('No Scene.json found or failed to load scene data.');
        }
      }

      EditorLogger.info(`Project loaded: ${this.projectName}`);
      this.clearUnsaved();
      this.startAutoSave();
    } catch (error) {
      EditorLogger.error('Failed to load project:', error);
    }
  }

  /**
   * Alias for createMaterialAsset for easier naming consistency.
   */
  public static async createNewMaterial(name: string): Promise<string | null> {
    return this.createMaterialAsset(name);
  }

  /**
   * Creates a new material asset (.mat) in Assets/Materials/
   */
  public static async createMaterialAsset(name: string): Promise<string | null> {
    if (!this.directoryHandle) return null;

    try {
      // Obtenemos Assets
      const assetsHandle = await this.directoryHandle.getDirectoryHandle('Assets', { create: true });

      // Entramos/Creamos la subcarpeta Materials
      const materialsHandle = await assetsHandle.getDirectoryHandle('Materials', { create: true });

      const fileName = `${name}.mat`;

      try {
        // Verificamos en la subcarpeta
        await materialsHandle.getFileHandle(fileName);
        EditorLogger.warn(`Material '${fileName}' already exists. Creation aborted.`);
        return null;
      } catch (e) {
        // Creamos en la subcarpeta
        const fileHandle = await materialsHandle.getFileHandle(fileName, { create: true });

        const materialData = {
          name: name,
          baseColor: [1, 1, 1, 1],
          metallic: 0.0,
          roughness: 0.5,
          textures: { albedo: "", roughness: "", normal: "" }
        };

        const writable = await (fileHandle as any).createWritable();
        await writable.write(JSON.stringify(materialData, null, 2));
        await writable.close();

        EditorLogger.info(`Created material ${fileName} in /Assets/Materials`);
        return `Materials/${fileName}`; // Relative path from Assets
      }
    } catch (e) {
      EditorLogger.error("ProjectSystem: Failed to create material", e);
      return null;
    }
  }

  /**
   * Saves material data back to its asset file.
   */
  public static async saveMaterialAsset(relativePath: string, data: any): Promise<boolean> {
    if (!this.directoryHandle) return false;

    try {
      const assetsDir = await this.directoryHandle.getDirectoryHandle('Assets');
      const parts = relativePath.split(/[/\\]/);
      let currentDir = assetsDir;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (part === '.' || part === '') continue;
        currentDir = await currentDir.getDirectoryHandle(part);
      }

      const fileName = parts[parts.length - 1];
      const fileHandle = await currentDir.getFileHandle(fileName);

      const writable = await (fileHandle as any).createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();

      EditorLogger.info(`ProjectSystem: Saved material ${relativePath}`);
      return true;
    } catch (e) {
      EditorLogger.error("ProjectSystem: Failed to save material", e);
      return false;
    }
  }

  /**
   * Loads material data (.mat) from Assets/Materials/
   */
  public static async loadMaterialData(fileName: string): Promise<any | null> {
    // 1. CHEQUEO DE MEMORIA (Prioridad Absoluta - Phase 56)
    if (this.dirtyMaterials.has(fileName)) {
      return JSON.parse(JSON.stringify(this.dirtyMaterials.get(fileName)));
    }

    if (!this.directoryHandle) return null;

    try {
      const assetsDir = await this.directoryHandle.getDirectoryHandle('Assets');
      const materialsDir = await assetsDir.getDirectoryHandle('Materials');
      const fileHandle = await materialsDir.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch (e) {
      EditorLogger.error(`ProjectSystem: Failed to load material data for ${fileName}`, e);
      return null;
    }
  }

  /**
   * Saves material data (.mat) to Assets/Materials/
   */
  public static async saveMaterialData(fileName: string, data: any): Promise<boolean> {
    if (!this.directoryHandle) return false;

    try {
      const assetsDir = await this.directoryHandle.getDirectoryHandle('Assets');
      const materialsDir = await assetsDir.getDirectoryHandle('Materials');
      const fileHandle = await materialsDir.getFileHandle(fileName, { create: true });

      const writable = await (fileHandle as any).createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();

      EditorLogger.info(`ProjectSystem: Saved material data for ${fileName}`);
      return true;
    } catch (e) {
      EditorLogger.error(`ProjectSystem: Failed to save material data for ${fileName}`, e);
      return false;
    }
  }

  /**
   * Resolves a relative path from the Assets directory to a FileSystemFileHandle.
   */
  public static async getFileHandle(relativePath: string): Promise<FileSystemFileHandle | null> {
    if (!this.directoryHandle) return null;

    try {
      const assetsDir = await this.directoryHandle.getDirectoryHandle('Assets');
      const parts = relativePath.split(/[/\\]/);
      let currentDir = assetsDir;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (part === '.' || part === '' || part === 'Assets') continue;
        currentDir = await currentDir.getDirectoryHandle(part);
      }

      const fileName = parts[parts.length - 1];
      return await currentDir.getFileHandle(fileName);
    } catch (e) {
      // Expected if file doesn't exist
      return null;
    }
  }

  /**
   * Checks if an asset is being referenced by other files (Materials or Scene).
   */
  public static async checkAssetDependencies(fileName: string, type: 'texture' | 'material'): Promise<string[]> {
    const dependencies: string[] = [];
    if (!this.directoryHandle) return dependencies;

    try {
      if (type === 'texture') {
        // Search in all Materials to see if they use this texture
        const assetsHandle = await this.directoryHandle.getDirectoryHandle('Assets');
        const matHandle = await assetsHandle.getDirectoryHandle('Materials').catch(() => null);
        if (matHandle) {
          for await (const [matName, entry] of (matHandle as any).entries()) {
            if (entry.kind === 'file' && matName.endsWith('.mat')) {
              const file = await entry.getFile();
              const text = await file.text();
              // Fast check if texture name is in material JSON
              if (text.includes(fileName)) {
                dependencies.push(`Material: ${matName}`);
              }
            }
          }
        }
      } else if (type === 'material') {
        // Search in Scene.json (Legacy) or all .gmap files in Maps/ for references
        const mapsDir = await this.directoryHandle.getDirectoryHandle('Maps').catch(() => null);
        if (mapsDir) {
          for await (const [fileName, entry] of (mapsDir as any).entries()) {
            if (entry.kind === 'file' && fileName.endsWith('.gmap')) {
              const file = await entry.getFile();
              const text = await file.text();
              if (text.includes(fileName)) {
                dependencies.push(`Level: ${fileName}`);
              }
            }
          }
        }

        const sceneFile = await this.directoryHandle.getFileHandle('Scene.json', { create: false }).catch(() => null);
        if (sceneFile) {
          const file = await sceneFile.getFile();
          const text = await file.text();
          if (text.includes(fileName)) {
            dependencies.push(`Actor in Scene.json (Legacy)`);
          }
        }
      }
    } catch (e) {
      EditorLogger.error("Error checking dependencies", e);
    }
    return dependencies;
  }

  /**
   * Imports external files into the project, categorizing them into Textures or Models.
   */
  public static async importFiles(): Promise<boolean> {
    if (!this.directoryHandle) return false;

    try {
      const fileHandles = await (window as any).showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: 'Assets (Images & Models)',
            accept: {
              'image/*': ['.png', '.jpg', '.jpeg', '.tga', '.webp'],
              'model/*': ['.glb', '.gltf', '.obj']
            }
          }
        ]
      });

      if (!fileHandles || fileHandles.length === 0) return false;

      const assetsHandle = await this.directoryHandle.getDirectoryHandle('Assets', { create: true });
      const texturesHandle = await assetsHandle.getDirectoryHandle('Textures', { create: true });
      const modelsHandle = await assetsHandle.getDirectoryHandle('Models', { create: true });

      let importedCount = 0;

      for (const handle of fileHandles) {
        const file = await handle.getFile();
        const name = file.name;
        const ext = name.split('.').pop()?.toLowerCase() || '';

        const isModel = ['glb', 'gltf', 'obj'].includes(ext);
        const targetDir = isModel ? modelsHandle : texturesHandle;
        const subfolderName = isModel ? 'Models' : 'Textures';

        try {
          const newFileHandle = await targetDir.getFileHandle(name, { create: true });
          const writable = await (newFileHandle as any).createWritable();
          await writable.write(await file.arrayBuffer());
          await writable.close();

          EditorLogger.info(`Imported ${name} to /Assets/${subfolderName}`);
          importedCount++;
        } catch (e) {
          EditorLogger.error(`Failed to import ${name}`, e);
        }
      }

      return importedCount > 0;
    } catch (e: any) {
      if (e.name === 'AbortError') return false;
      EditorLogger.error("ProjectSystem: Failed to import files", e);
      return false;
    }
  }
}

// Browser exit warning for unsaved changes (Phase 54)
window.addEventListener('beforeunload', (e) => {
  if (ProjectSystem.hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = 'Tienes cambios sin guardar. Si sales, perderás las modificaciones en la escena y los materiales.';
  }
});
