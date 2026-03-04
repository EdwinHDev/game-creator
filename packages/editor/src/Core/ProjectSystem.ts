import { UMeshComponent } from '@game-creator/engine';

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
      this.directoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite'
      });

      if (!this.directoryHandle) return false;

      this.projectName = this.directoryHandle.name;
      document.title = `Game Creator - ${this.projectName}`;

      // Create folder structure
      await this.directoryHandle.getDirectoryHandle('Assets', { create: true });
      await this.directoryHandle.getDirectoryHandle('Saved', { create: true });

      // Create project file
      const projectFileHandle = await this.directoryHandle.getFileHandle('Project.gproj', { create: true });
      const writable = await projectFileHandle.createWritable();
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
      const writable = await sceneFileHandle.createWritable();
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
      this.directoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite'
      });

      if (!this.directoryHandle) return;

      // Validate project file
      try {
        await this.directoryHandle.getFileHandle('Project.gproj');
      } catch {
        alert('Invalid project directory: Project.gproj not found.');
        return;
      }

      this.projectName = this.directoryHandle.name;
      document.title = `Game Creator - ${this.projectName}`;

      // Load scene data
      try {
        const sceneFileHandle = await this.directoryHandle.getFileHandle('Scene.json');
        const file = await sceneFileHandle.getFile();
        const text = await file.text();
        const sceneData = JSON.parse(text);

        const world = engine.getWorld();
        const device = engine.getRenderer().getDevice();

        await world.deserialize(sceneData);

        // Phase 1: Re-instantiate mesh buffers for loaded actors
        for (const actor of world.actors) {
          const meshComp = actor.getComponent(UMeshComponent);
          if (meshComp) {
            // We deduce the primitive type from name for Phase 1 demo
            if (actor.name.startsWith('Cube')) meshComp.createBox(device);
            else if (actor.name.startsWith('Sphere')) meshComp.createSphere(device, 1.0, 32);
            else if (actor.name.startsWith('Plane')) meshComp.createPlane(device, 2.0, 10);
            else if (actor.name.startsWith('Cylinder')) meshComp.createCylinder(device, 1.0, 2.0, 32);
            else if (actor.name.startsWith('Capsule')) meshComp.createCapsule(device, 0.5, 2.0, 32, 16);
          }
        }

      } catch (e) {
        console.warn('No Scene.json found or failed to load scene data.', e);
      }

      console.log(`Project loaded: ${this.projectName}`);
    } catch (error) {
      console.error('Failed to load project:', error);
    }
  }
}
