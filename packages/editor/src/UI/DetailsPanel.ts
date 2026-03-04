import { EventBus, quat, UDirectionalLightComponent, UMeshComponent } from '@game-creator/engine';
import { EditorLogger } from '../Core/EditorLogger';
import { ProjectSystem } from '../Core/ProjectSystem';

/**
 * Details Panel Web Component for inspecting and modifying actor properties.
 */
export class DetailsPanel extends HTMLElement {
  private currentActor: any = null;
  private currentMode: 'actor' | 'asset' = 'actor';
  private selectedAssetName: string | null = null;
  private selectedAssetData: any = null;

  constructor() {
    super();
    this.setupStyles();
  }

  connectedCallback() {
    EventBus.on('OnActorSelected', this.handleActorSelected);
    EventBus.on('OnActorDestroyed', this.handleActorDestroyed);
    EventBus.on('OnAssetSelected', this.handleAssetSelected);
    EventBus.on('EngineTick', this.handleTick);
    this.render();
  }

  disconnectedCallback() {
    EventBus.off('OnActorSelected', this.handleActorSelected);
    EventBus.off('OnActorDestroyed', this.handleActorDestroyed);
    EventBus.off('OnAssetSelected', this.handleAssetSelected);
    EventBus.off('EngineTick', this.handleTick);
  }

  private handleActorSelected = (actor: any) => {
    EditorLogger.info('DetailsPanel received actor:', actor?.name);
    this.currentActor = actor;
    this.currentMode = 'actor';
    this.selectedAssetName = null;
    this.render();
  };

  private handleAssetSelected = async (asset: any) => {
    EditorLogger.info('DetailsPanel received asset:', asset.name);
    if (asset.type === 'material') {
      this.currentMode = 'asset';
      this.selectedAssetName = asset.name;
      this.selectedAssetData = await ProjectSystem.loadMaterialData(asset.name);
      this.currentActor = null;
      this.render();
    } else {
      // Texture or other assets - basic preview
      this.currentMode = 'asset';
      this.selectedAssetName = asset.name;
      this.selectedAssetData = null;
      this.currentActor = null;
      this.render();
    }
  };

  private handleActorDestroyed = (actor: any) => {
    if (this.currentActor && this.currentActor.id === actor.id) {
      this.currentActor = null;
      this.render();
    }
  };

  private handleTick = () => {
    if (!this.currentActor || !this.currentActor.rootComponent) return;
    this.updateInputValues();
  };

  private updateInputValues() {
    const root = this.currentActor.rootComponent;

    // Position
    const pX = this.querySelector('#pos-x') as HTMLInputElement;
    const pY = this.querySelector('#pos-y') as HTMLInputElement;
    const pZ = this.querySelector('#pos-z') as HTMLInputElement;
    if (pX && document.activeElement !== pX) pX.value = root.relativeLocation[0].toFixed(2);
    if (pY && document.activeElement !== pY) pY.value = root.relativeLocation[1].toFixed(2);
    if (pZ && document.activeElement !== pZ) pZ.value = root.relativeLocation[2].toFixed(2);

    // Scale
    const sX = this.querySelector('#sca-x') as HTMLInputElement;
    const sY = this.querySelector('#sca-y') as HTMLInputElement;
    const sZ = this.querySelector('#sca-z') as HTMLInputElement;
    if (sX && document.activeElement !== sX) sX.value = root.relativeScale[0].toFixed(2);
    if (sY && document.activeElement !== sY) sY.value = root.relativeScale[1].toFixed(2);
    if (sZ && document.activeElement !== sZ) sZ.value = root.relativeScale[2].toFixed(2);

    // Rotation (Euler)
    const rotX = this.querySelector('#rot-x') as HTMLInputElement;
    const rotY = this.querySelector('#rot-y') as HTMLInputElement;
    const rotZ = this.querySelector('#rot-z') as HTMLInputElement;
    if (rotX && rotY && rotZ) {
      const euler = this.quatToEuler(root.relativeRotation);
      if (document.activeElement !== rotX) rotX.value = euler[0].toFixed(0);
      if (document.activeElement !== rotY) rotY.value = euler[1].toFixed(0);
      if (document.activeElement !== rotZ) rotZ.value = euler[2].toFixed(0);
    }
  }

  private quatToEuler(q: any): number[] {
    const w = q[3], x = q[0], y = q[1], z = q[2];

    // Roll (X-axis rotation)
    const sinr_cosp = 2 * (w * x + y * z);
    const cosr_cosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);

    // Pitch (Y-axis rotation)
    const sinp = 2 * (w * y - z * x);
    let pitch: number;
    if (Math.abs(sinp) >= 1)
      pitch = (Math.PI / 2) * Math.sign(sinp);
    else
      pitch = Math.asin(sinp);

    // Yaw (Z-axis rotation)
    const siny_cosp = 2 * (w * z + x * y);
    const cosy_cosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);

    return [
      roll * (180 / Math.PI),
      pitch * (180 / Math.PI),
      yaw * (180 / Math.PI)
    ];
  }

  private render() {
    // 1. Clear contents
    this.innerHTML = '';

    // 2. Fallback if no selection
    if (!this.currentActor && !this.selectedAssetName) {
      const empty = document.createElement('div');
      empty.className = 'p-4 text-muted';
      empty.style.opacity = '0.5';
      empty.style.fontStyle = 'italic';
      empty.style.padding = '20px';
      empty.textContent = 'Select an object or material asset to view details.';
      this.appendChild(empty);
      return;
    }

    // SCENARIO B: Material Asset Selected
    if (this.currentMode === 'asset' && this.selectedAssetName?.endsWith('.mat')) {
      this.renderMaterialMode(this.selectedAssetName, this.selectedAssetData);
      return;
    }

    if (this.currentMode === 'asset') {
      const info = document.createElement('div');
      info.style.padding = '20px';
      info.textContent = `Asset Selected: ${this.selectedAssetName}`;
      this.appendChild(info);
      return;
    }

    // SCENARIO A: Actor Selected
    // 3. Header
    const header = document.createElement('div');
    header.style.padding = '15px';
    header.style.borderBottom = '1px solid var(--border-color)';
    header.style.backgroundColor = 'var(--bg-surface)';

    const title = document.createElement('h3');
    title.textContent = this.currentActor.name;
    title.style.margin = '0';
    title.style.fontSize = '14px';
    title.style.color = 'var(--accent-color)';
    header.appendChild(title);
    this.appendChild(header);

    // 4. Transform Section
    const root = this.currentActor.rootComponent;
    if (root && root.relativeLocation) {
      this.renderTransformUI(root);
    }

    // 5. Material Section
    const mesh = this.currentActor.getComponent ? this.currentActor.getComponent(UMeshComponent) : null;
    if (mesh) {
      this.renderActorMaterialUI(mesh);
    }

    // 6. Light Section
    const light = this.currentActor.getComponent(UDirectionalLightComponent);
    if (light) {
      this.renderLightUI(light);
    }
  }

  private renderLightUI(light: any) {
    const section = document.createElement('div');
    section.style.padding = '15px';
    section.style.borderTop = '1px solid var(--border-color)';

    const sectionTitle = document.createElement('div');
    sectionTitle.textContent = 'DIRECTIONAL LIGHT';
    sectionTitle.style.fontSize = '10px';
    sectionTitle.style.fontWeight = 'bold';
    sectionTitle.style.marginBottom = '10px';
    sectionTitle.style.opacity = '0.6';
    section.appendChild(sectionTitle);

    const group = document.createElement('div');
    group.className = 'input-group';
    group.innerHTML = `
      <div style="margin-bottom: 8px;">
        <label>Intensity</label>
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="range" id="light-intensity-range" min="0" max="50" step="0.1" value="${light.intensity}" style="flex: 1;">
          <input type="number" id="light-intensity-num" step="0.1" value="${light.intensity}" style="width: 50px;">
        </div>
      </div>
      <div style="margin-bottom: 8px;">
        <label>Light Color</label>
        <input type="color" id="light-color" value="${this.rgbToHex(light.color)}">
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" id="light-cast-shadows" ${light.castShadows ? 'checked' : ''} style="width: auto;">
        <label style="margin: 0;">Cast Shadows</label>
      </div>
    `;
    section.appendChild(group);
    this.appendChild(section);

    // Event Listeners
    const intRange = group.querySelector('#light-intensity-range') as HTMLInputElement;
    const intNum = group.querySelector('#light-intensity-num') as HTMLInputElement;
    const colorInput = group.querySelector('#light-color') as HTMLInputElement;
    const shadowCheck = group.querySelector('#light-cast-shadows') as HTMLInputElement;

    const updateIntensity = (val: string) => {
      const v = parseFloat(val) || 0;
      light.intensity = v;
      intRange.value = v.toString();
      intNum.value = v.toString();
    };

    intRange.addEventListener('input', (e) => updateIntensity((e.target as HTMLInputElement).value));
    intNum.addEventListener('input', (e) => updateIntensity((e.target as HTMLInputElement).value));

    colorInput.addEventListener('input', (e) => {
      this.hexToRgb((e.target as HTMLInputElement).value, light.color);
    });

    shadowCheck.addEventListener('change', (e) => {
      light.castShadows = (e.target as HTMLInputElement).checked;
    });
  }

  private rgbToHex(rgba: Float32Array): string {
    const r = Math.round(rgba[0] * 255).toString(16).padStart(2, '0');
    const g = Math.round(rgba[1] * 255).toString(16).padStart(2, '0');
    const b = Math.round(rgba[2] * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  private hexToRgb(hex: string, out: Float32Array) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    out[0] = r;
    out[1] = g;
    out[2] = b;
    // out[3] remains 1.0 (Alpha)
  }

  private renderTransformUI(root: any) {
    const section = document.createElement('div');
    section.style.padding = '15px';

    const sectionTitle = document.createElement('div');
    sectionTitle.textContent = 'TRANSFORM';
    sectionTitle.style.fontSize = '10px';
    sectionTitle.style.fontWeight = 'bold';
    sectionTitle.style.marginBottom = '10px';
    sectionTitle.style.opacity = '0.6';
    section.appendChild(sectionTitle);

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr 1fr';
    grid.style.gap = '8px';

    grid.innerHTML = `
      <div class="input-group">
        <label>Pos X</label>
        <input type="number" id="pos-x" step="0.1" value="${root.relativeLocation[0]}">
      </div>
      <div class="input-group">
        <label>Pos Y</label>
        <input type="number" id="pos-y" step="0.1" value="${root.relativeLocation[1]}">
      </div>
      <div class="input-group">
        <label>Pos Z</label>
        <input type="number" id="pos-z" step="0.1" value="${root.relativeLocation[2]}">
      </div>

      <div class="input-group">
        <label>Rot X</label>
        <input type="number" id="rot-x" step="1.0" value="0">
      </div>
      <div class="input-group">
        <label>Rot Y</label>
        <input type="number" id="rot-y" step="1.0" value="0">
      </div>
      <div class="input-group">
        <label>Rot Z</label>
        <input type="number" id="rot-z" step="1.0" value="0">
      </div>

      <div class="input-group">
        <label>Sca X</label>
        <input type="number" id="sca-x" step="0.1" value="${root.relativeScale[0]}">
      </div>
      <div class="input-group">
        <label>Sca Y</label>
        <input type="number" id="sca-y" step="0.1" value="${root.relativeScale[1]}">
      </div>
      <div class="input-group">
        <label>Sca Z</label>
        <input type="number" id="sca-z" step="0.1" value="${root.relativeScale[2]}">
      </div>
    `;

    section.appendChild(grid);
    this.appendChild(section);

    // 5. Two-Way Binding
    const inputX = section.querySelector('#pos-x') as HTMLInputElement;
    const inputY = section.querySelector('#pos-y') as HTMLInputElement;
    const inputZ = section.querySelector('#pos-z') as HTMLInputElement;

    if (inputX) {
      inputX.addEventListener('input', (e) => {
        root.relativeLocation[0] = parseFloat((e.target as HTMLInputElement).value) || 0;
      });
    }
    if (inputY) {
      inputY.addEventListener('input', (e) => {
        root.relativeLocation[1] = parseFloat((e.target as HTMLInputElement).value) || 0;
      });
    }
    if (inputZ) {
      inputZ.addEventListener('input', (e) => {
        root.relativeLocation[2] = parseFloat((e.target as HTMLInputElement).value) || 0;
      });
    }

    // Rotation Binding
    const rotX = section.querySelector('#rot-x') as HTMLInputElement;
    const rotY = section.querySelector('#rot-y') as HTMLInputElement;
    const rotZ = section.querySelector('#rot-z') as HTMLInputElement;

    const updateRotation = () => {
      const pitch = parseFloat(rotX.value) || 0;
      const yaw = parseFloat(rotY.value) || 0;
      const roll = parseFloat(rotZ.value) || 0;
      quat.fromEuler(root.relativeRotation, pitch, yaw, roll);
    };

    if (rotX) rotX.addEventListener('input', updateRotation);
    if (rotY) rotY.addEventListener('input', updateRotation);
    if (rotZ) rotZ.addEventListener('input', updateRotation);

    // Scale Binding
    const scaX = section.querySelector('#sca-x') as HTMLInputElement;
    const scaY = section.querySelector('#sca-y') as HTMLInputElement;
    const scaZ = section.querySelector('#sca-z') as HTMLInputElement;

    if (scaX) {
      scaX.addEventListener('input', (e) => {
        root.relativeScale[0] = parseFloat((e.target as HTMLInputElement).value) || 1;
      });
    }
    if (scaY) {
      scaY.addEventListener('input', (e) => {
        root.relativeScale[1] = parseFloat((e.target as HTMLInputElement).value) || 1;
      });
    }
    if (scaZ) {
      scaZ.addEventListener('input', (e) => {
        root.relativeScale[2] = parseFloat((e.target as HTMLInputElement).value) || 1;
      });
    }

    // Add some quick styles for the groups
    const style = document.createElement('style');
    style.textContent = `
      .input-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .input-group label {
        font-size: 9px;
        font-weight: bold;
        opacity: 0.5;
      }
      .input-group input {
        background: var(--bg-base);
        color: var(--text-main);
        border: 1px solid var(--border-color);
        padding: 4px;
        border-radius: 4px;
        font-size: 11px;
        width: 100%;
        outline: none;
      }
      .input-group input:focus {
        border-color: var(--accent-color);
      }
    `;
    this.appendChild(style);
  }

  private setupStyles() {
    this.style.display = 'block';
    this.style.width = '100%';
    this.style.height = '100%';
    this.style.overflowY = 'auto';
    this.style.backgroundColor = 'var(--bg-panel)';
  }
  private async renderActorMaterialUI(mesh: any) {
    const section = document.createElement('div');
    section.style.padding = '15px';
    section.style.borderTop = '1px solid var(--border-color)';

    section.innerHTML = `
      <div style="font-size: 10px; font-weight: bold; margin-bottom: 10px; opacity: 0.6;">MESH MATERIAL</div>
      <div class="input-group">
        <label>Material Asset</label>
        <div id="material-slot" style="padding: 8px; background: var(--bg-surface); border: 1px dashed var(--border-color); border-radius: 4px; font-size: 11px; cursor: pointer; text-align: center;">
          ${mesh.materialPath || 'None (Using Default)'}
        </div>
      </div>
    `;

    const slot = section.querySelector('#material-slot') as HTMLElement;
    slot.addEventListener('click', async () => {
      // In a real editor, this would open an asset picker.
      // For now, if a material is selected in Content Browser, we assign it.
      if (this.selectedAssetName?.endsWith('.mat')) {
        mesh.materialPath = `Materials/${this.selectedAssetName}`;
        slot.textContent = mesh.materialPath;

        // Phase 2 logic: Update resources
        const { UAssetManager, Engine } = await import('@game-creator/engine');
        const device = Engine.getInstance().getRenderer().getDevice();
        if (device) {
          const material = await UAssetManager.getInstance().loadMaterial(mesh.materialPath, device);
          if (material) {
            mesh.material = material;
          }
        }
      } else {
        alert("Select a material in the Content Browser first to assign it here.");
      }
    });

    // Drag & Drop (Phase 50)
    slot.addEventListener('dragover', (e) => {
      e.preventDefault();
      slot.style.borderColor = 'var(--accent-color)';
      slot.style.backgroundColor = 'rgba(255,255,255,0.05)';
    });

    slot.addEventListener('dragleave', () => {
      slot.style.borderColor = 'var(--border-color)';
      slot.style.backgroundColor = 'var(--bg-surface)';
    });

    slot.addEventListener('drop', async (e) => {
      e.preventDefault();
      slot.style.borderColor = 'var(--border-color)';
      slot.style.backgroundColor = 'var(--bg-surface)';

      const dataStr = e.dataTransfer?.getData('application/json');
      if (dataStr) {
        try {
          const dragData = JSON.parse(dataStr);
          if (dragData.type === 'material') {
            mesh.materialPath = `Materials/${dragData.name}`;
            slot.textContent = mesh.materialPath;

            // Load material via Engine
            const { UAssetManager, Engine } = await import('@game-creator/engine');
            const device = Engine.getInstance().getRenderer().getDevice();
            if (device) {
              const material = await UAssetManager.getInstance().loadMaterial(mesh.materialPath, device);
              if (material) {
                mesh.material = material;
                EditorLogger.info(`Material ${dragData.name} applied to Actor via Drag & Drop.`);
              }
            }
          }
        } catch (err) {
          EditorLogger.error("Failed to parse material drop data", err);
        }
      }
    });

    this.appendChild(section);
  }

  private renderMaterialMode(fileName: string, data: any) {
    if (!data) return;

    const container = document.createElement('div');
    container.style.padding = '15px';

    const header = document.createElement('div');
    header.style.marginBottom = '20px';
    header.innerHTML = `
      <div style="font-size: 10px; color: var(--accent-color); font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">Material Asset</div>
      <div style="font-size: 16px; font-weight: bold;">${fileName}</div>
    `;
    container.appendChild(header);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'input-group';
    controls.style.display = 'flex';
    controls.style.flexDirection = 'column';
    controls.style.gap = '15px';

    // Base Color
    const colorRow = document.createElement('div');
    colorRow.innerHTML = `
      <label>Base Color</label>
      <input type="color" id="mat-base-color" value="${this.vec4ToHex(data.baseColor)}">
    `;
    controls.appendChild(colorRow);

    // Metallic
    const metallicRow = document.createElement('div');
    metallicRow.innerHTML = `
      <label>Metallic</label>
      <div style="display: flex; gap: 10px; align-items: center;">
        <input type="range" id="mat-metallic-range" min="0" max="1" step="0.01" value="${data.metallic}" style="flex: 1;">
        <span id="mat-metallic-val" style="font-size: 11px; width: 30px;">${data.metallic}</span>
      </div>
    `;
    controls.appendChild(metallicRow);

    // Roughness
    const roughnessRow = document.createElement('div');
    roughnessRow.innerHTML = `
      <label>Roughness</label>
      <div style="display: flex; gap: 10px; align-items: center;">
        <input type="range" id="mat-roughness-range" min="0" max="1" step="0.01" value="${data.roughness}" style="flex: 1;">
        <span id="mat-roughness-val" style="font-size: 11px; width: 30px;">${data.roughness}</span>
      </div>
    `;
    controls.appendChild(roughnessRow);

    container.appendChild(controls);

    // Texture Slots (Phase 47)
    const textureHeader = document.createElement('div');
    textureHeader.textContent = 'Texture Maps';
    textureHeader.style.fontSize = '10px';
    textureHeader.style.fontWeight = 'bold';
    textureHeader.style.marginTop = '10px';
    textureHeader.style.opacity = '0.6';
    textureHeader.style.textTransform = 'uppercase';
    controls.appendChild(textureHeader);

    if (!data.textures) data.textures = { albedo: "", roughness: "", normal: "" };

    const albedoSlot = this.createTextureSlot('Albedo (Base Color)', data.textures.albedo, (path: string) => {
      data.textures.albedo = path;
      this.render();
    });
    const normalSlot = this.createTextureSlot('Normal Map', data.textures.normal, (path: string) => {
      data.textures.normal = path;
      this.render();
    });
    const roughSlot = this.createTextureSlot('Roughness Map', data.textures.roughness, (path: string) => {
      data.textures.roughness = path;
      this.render();
    });

    controls.appendChild(albedoSlot);
    controls.appendChild(normalSlot);
    controls.appendChild(roughSlot);

    // Save Button
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Changes';
    saveBtn.style.marginTop = '25px';
    saveBtn.style.width = '100%';
    saveBtn.style.padding = '10px';
    saveBtn.style.backgroundColor = 'var(--accent-color)';
    saveBtn.style.color = 'white';
    saveBtn.style.border = 'none';
    saveBtn.style.borderRadius = '4px';
    saveBtn.style.cursor = 'pointer';
    saveBtn.style.fontWeight = 'bold';
    saveBtn.style.textTransform = 'uppercase';
    saveBtn.style.fontSize = '0.75rem';

    saveBtn.onclick = async () => {
      const success = await ProjectSystem.saveMaterialData(fileName, data);
      if (success) {
        EditorLogger.info(`Saved changes to ${fileName}`);
        // Optionally notify engine to reload this material
        EventBus.emit('RequestContentBrowserRefresh', {});
      }
    };

    container.appendChild(saveBtn);
    this.appendChild(container);

    // Bindings
    const baseColorInput = container.querySelector('#mat-base-color') as HTMLInputElement;
    baseColorInput.oninput = (e) => {
      const hex = (e.target as HTMLInputElement).value;
      const rgb = this.hexToVec4(hex);
      data.baseColor = rgb;
    };

    const metRange = container.querySelector('#mat-metallic-range') as HTMLInputElement;
    const metVal = container.querySelector('#mat-metallic-val') as HTMLSpanElement;
    metRange.oninput = (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      data.metallic = val;
      metVal.textContent = val.toFixed(2);
    };

    const roughRange = container.querySelector('#mat-roughness-range') as HTMLInputElement;
    const roughVal = container.querySelector('#mat-roughness-val') as HTMLSpanElement;
    roughRange.oninput = (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      data.roughness = val;
      roughVal.textContent = val.toFixed(2);
    };
  }

  private vec4ToHex(v: number[]): string {
    const r = Math.round(v[0] * 255).toString(16).padStart(2, '0');
    const g = Math.round(v[1] * 255).toString(16).padStart(2, '0');
    const b = Math.round(v[2] * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  private hexToVec4(hex: string): number[] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b, 1.0];
  }

  private createTextureSlot(slotName: string, currentPath: string, onDrop: (path: string) => void): HTMLElement {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.marginBottom = '10px';

    const label = document.createElement('label');
    label.textContent = slotName;
    label.style.fontSize = '0.75rem';
    label.style.marginBottom = '4px';

    const dropZone = document.createElement('div');
    dropZone.style.display = 'flex';
    dropZone.style.alignItems = 'center';
    dropZone.style.gap = '8px';
    dropZone.style.height = '40px';
    dropZone.style.border = '1px dashed var(--border-color)';
    dropZone.style.backgroundColor = 'var(--bg-base)';
    dropZone.style.padding = '0 8px';
    dropZone.style.borderRadius = '4px';
    dropZone.style.cursor = 'pointer';

    // Thumbnail container
    const slotThumb = document.createElement('div');
    slotThumb.style.width = '24px';
    slotThumb.style.height = '24px';
    slotThumb.style.borderRadius = '2px';
    slotThumb.style.display = 'flex';
    slotThumb.style.alignItems = 'center';
    slotThumb.style.justifyContent = 'center';
    slotThumb.style.overflow = 'hidden';
    slotThumb.style.flexShrink = '0';

    const infoText = document.createElement('div');
    infoText.style.fontSize = '0.7rem';
    infoText.style.whiteSpace = 'nowrap';
    infoText.style.overflow = 'hidden';
    infoText.style.textOverflow = 'ellipsis';

    const updateVisuals = async (path: string) => {
      slotThumb.innerHTML = '';
      if (path) {
        const fullPath = path.startsWith('Assets/') ? path : `Assets/${path}`;
        const handle = await ProjectSystem.getFileHandle(fullPath);
        if (handle) {
          const file = await handle.getFile();
          const url = URL.createObjectURL(file);
          const img = document.createElement('img');
          img.src = url;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'contain';
          slotThumb.appendChild(img);
        } else {
          slotThumb.textContent = '❓';
        }
        infoText.textContent = path.split(/[/\\]/).pop() || '';
        infoText.style.color = 'var(--text-main)';
        infoText.style.fontStyle = 'normal';

        // Clear button (Phase 49)
        const clearBtn = document.createElement('button');
        clearBtn.textContent = '✖';
        clearBtn.style.marginLeft = 'auto';
        clearBtn.style.background = 'transparent';
        clearBtn.style.border = 'none';
        clearBtn.style.color = 'var(--text-muted)';
        clearBtn.style.cursor = 'pointer';
        clearBtn.style.fontSize = '12px';
        clearBtn.style.padding = '4px 8px';
        clearBtn.style.transition = 'color 0.2s';

        clearBtn.onmouseenter = () => clearBtn.style.color = '#ff4757';
        clearBtn.onmouseleave = () => clearBtn.style.color = 'var(--text-muted)';

        clearBtn.onclick = (e) => {
          e.stopPropagation();
          onDrop('');
        };

        dropZone.appendChild(clearBtn);
      } else {
        slotThumb.style.backgroundColor = 'var(--bg-surface)';
        slotThumb.style.border = '1px solid var(--border-color)';
        const placeholderIcon = document.createElement('span');
        placeholderIcon.textContent = '🖼️';
        placeholderIcon.style.opacity = '0.4';
        placeholderIcon.style.fontSize = '0.8rem';
        slotThumb.appendChild(placeholderIcon);

        infoText.textContent = 'Empty...';
        infoText.style.color = 'var(--text-muted)';
        infoText.style.fontStyle = 'italic';
      }
    };

    updateVisuals(currentPath);

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--accent-color)';
      dropZone.style.backgroundColor = 'rgba(255,255,255,0.05)';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'var(--border-color)';
      dropZone.style.backgroundColor = 'var(--bg-base)';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border-color)';
      dropZone.style.backgroundColor = 'var(--bg-base)';
      const dataStr = e.dataTransfer?.getData('application/json');
      if (dataStr) {
        try {
          const dragData = JSON.parse(dataStr);
          if (dragData.type === 'texture') {
            updateVisuals(dragData.path);
            onDrop(dragData.path);
          }
        } catch (err) {
          EditorLogger.error("Failed to parse drop data", err);
        }
      }
    });

    dropZone.appendChild(slotThumb);
    dropZone.appendChild(infoText);
    container.appendChild(label);
    container.appendChild(dropZone);
    return container;
  }
}

customElements.define('gc-details-panel', DetailsPanel);
