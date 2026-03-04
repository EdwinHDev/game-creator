import { UMeshComponent, UAssetManager, EventBus } from '@game-creator/engine';

/**
 * Static class to manage the project lifecycle using the File System Access API.
 */
export class ProjectSystem {
  public static directoryHandle: FileSystemDirectoryHandle | null = null;
  public static projectName: string = 'Untitled Project';

  /**
   * Creates a new project structure in a user-selected directory.
   */
  public static async createProject(): Promise<boolean> {
    try {
      const handle = await (window as any).showDirectoryPicker({
        mode: 'readwrite'
      });

      if (!handle) return false;

      // Validate: Must be empty
      if (!await this.validateDirectoryForNew(handle)) {
        alert('Directorio no válido: La carpeta debe estar vacía para un nuevo proyecto.');
        return false;
      }

      this.directoryHandle = handle;
      this.projectName = handle.name;
      document.title = `Game Creator - ${this.projectName}`;

      UAssetManager.getInstance().reset(handle);
      EventBus.dispatch('PROJECT_LOADED', { handle: handle });
      EventBus.emit('RequestContentBrowserRefresh', {});

      // Create folder structure
      await handle.getDirectoryHandle('Assets', { create: true });
      await handle.getDirectoryHandle('Saved', { create: true });

      // Create project file
      const projectFileHandle = await handle.getFileHandle('Project.gproj', { create: true });
      const writable = await (projectFileHandle as any).createWritable();
      await writable.write(JSON.stringify({
        name: this.projectName,
        version: "1.0.0",
        created: new Date().toISOString()
      }, null, 2));
      await writable.close();

      console.log(`Project created: ${this.projectName}`);
      return true;
    } catch (error) {
      console.error('Failed to create project:', error);
      return false;
    }
  }

  private static async validateDirectoryForNew(handle: FileSystemDirectoryHandle): Promise<boolean> {
    let isEmpty = true;
    for await (const _ of (handle as any).values()) {
      _; // Silence unused warning
      isEmpty = false;
      break;
    }
    return isEmpty;
  }

  private static async validateDirectoryForOpen(handle: FileSystemDirectoryHandle): Promise<boolean> {
    try {
      await handle.getFileHandle('Project.gproj');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Saves the current experimental world state to the project directory.
   */
  public static async saveProject(world: any): Promise<void> {
    if (!this.directoryHandle) {
      console.warn('Cannot save project: No project open.');
      return;
    }

    try {
      const worldData = world.serialize();
      const sceneFileHandle = await this.directoryHandle.getFileHandle('Scene.json', { create: true });
      const writable = await (sceneFileHandle as any).createWritable();
      await writable.write(JSON.stringify(worldData, null, 2));
      await writable.close();

      console.log(`Project saved: ${this.projectName}`);
    } catch (error) {
      console.error('Failed to save project:', error);
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

      // Validate project file
      if (!await this.validateDirectoryForOpen(handle)) {
        alert('Directorio no válido: No se encontró el archivo Project.gproj.');
        return;
      }

      this.directoryHandle = handle;
      this.projectName = handle.name;
      document.title = `Game Creator - ${this.projectName}`;

      UAssetManager.getInstance().reset(handle);
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
        console.warn('No Scene.json found or failed to load scene data.');
      }

      console.log(`Project loaded: ${this.projectName}`);
    } catch (error) {
      console.error('Failed to load project:', error);
    }
  }

  /**
   * Creates a new material asset (.mat) in Assets/Materials/
   */
  public static async createMaterialAsset(name: string): Promise<string | null> {
    if (!this.directoryHandle) return null;

    try {
      const assetsDir = await this.directoryHandle.getDirectoryHandle('Assets', { create: true });
      const materialsDir = await assetsDir.getDirectoryHandle('Materials', { create: true });

      const fileName = `${name}.mat`;
      const fileHandle = await materialsDir.getFileHandle(fileName, { create: true });

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

      console.log(`ProjectSystem: Created material ${fileName}`);
      return `Materials/${fileName}`; // Relative path from Assets
    } catch (e) {
      console.error("ProjectSystem: Failed to create material", e);
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

      console.log(`ProjectSystem: Saved material ${relativePath}`);
      return true;
    } catch (e) {
      console.error("ProjectSystem: Failed to save material", e);
      return false;
    }
  }
}
