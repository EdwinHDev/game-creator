import { UMeshComponent, UAssetManager, EventBus } from '@game-creator/engine';
import { EditorLogger } from './EditorLogger';

/**
 * Static class to manage the project lifecycle using the File System Access API.
 */
export class ProjectSystem {
  public static directoryHandle: FileSystemDirectoryHandle | null = null;
  public static projectName: string = 'Untitled Project';

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

      // 2. Base Structure Creation
      await handle.getDirectoryHandle('Assets', { create: true });
      await handle.getDirectoryHandle('Saved', { create: true });

      // 3. Project Manifest Creation
      const projectFileHandle = await handle.getFileHandle('Project.gproj', { create: true });
      const writable = await (projectFileHandle as any).createWritable();
      await writable.write(JSON.stringify({
        name: this.projectName,
        version: "1.0.0",
        created: new Date().toISOString()
      }, null, 2));
      await writable.close();

      // 4. Initial Scene Creation
      const sceneFileHandle = await handle.getFileHandle('Scene.json', { create: true });
      const sceneWritable = await (sceneFileHandle as any).createWritable();
      await sceneWritable.write(JSON.stringify({ actors: [] }, null, 2));
      await sceneWritable.close();

      EditorLogger.info(`Project created: ${this.projectName}`);
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
        await handle.getFileHandle('Project.gproj');
        return true;
      } catch {
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
      const worldData = world.serialize();
      const sceneFileHandle = await this.directoryHandle.getFileHandle('Scene.json', { create: true });
      const writable = await (sceneFileHandle as any).createWritable();
      await writable.write(JSON.stringify(worldData, null, 2));
      await writable.close();

      EditorLogger.info(`Project saved: ${this.projectName}`);
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

      // 5. Load Scene Data if engine is provided
      if (engine) {
        try {
          const sceneFileHandle = await handle.getFileHandle('Scene.json');
          const file = await sceneFileHandle.getFile();
          const text = await file.text();
          if (text.trim()) {
            const sceneData = JSON.parse(text);
            if (engine.getWorld()) {
              await engine.getWorld().deserialize(sceneData);
            }
          }
        } catch (e) {
          EditorLogger.warn('Scene.json not found or failed to parse, starting with empty scene.');
        }
      }

      EventBus.dispatch('PROJECT_LOADED', { handle: handle });
      EventBus.emit('RequestContentBrowserRefresh', {});

      // Load scene data
      try {
        const sceneFileHandle = await handle.getFileHandle('Scene.json', { create: false });
        const file = await sceneFileHandle.getFile();
        const text = await file.text();
        const sceneData = JSON.parse(text);

        const world = engine.getWorld();
        const device = engine.getRenderer().getDevice();

        await world.deserialize(sceneData);

        // Re-instantiate mesh buffers for loaded actors
        for (const actor of world.actors) {
          const meshComp = actor.getComponent(UMeshComponent);
          if (meshComp) {
            if (actor.name.startsWith('Cube')) meshComp.createBox(device);
            else if (actor.name.startsWith('Sphere')) meshComp.createSphere(device, 1.0, 32);
            else if (actor.name.startsWith('Plane')) meshComp.createPlane(device, 2.0, 10);
            else if (actor.name.startsWith('Cylinder')) meshComp.createCylinder(device, 1.0, 2.0, 32);
            else if (actor.name.startsWith('Capsule')) meshComp.createCapsule(device, 0.5, 2.0, 32, 16);

            if (meshComp.materialPath) {
              const material = await UAssetManager.getInstance().loadMaterial(meshComp.materialPath, device);
              if (material) meshComp.material = material;
            } else if (meshComp.material) {
              await meshComp.material.updateResources(device, UAssetManager.getInstance());
            }
          }
        }

      } catch (e) {
        EditorLogger.warn('No Scene.json found or failed to load scene data.');
      }

      EditorLogger.info(`Project loaded: ${this.projectName}`);
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
