// uiConstants.js - UI constants and configuration
// Dependencies: None

window.uiConstants = {
    TAB_NAMES: ['JSON', 'Raw', 'History'],
    LAUNCHER_MINI_BUTTONS: [
        { id: 'gvp-mini-open', label: 'Open UI', icon: '🧰' }
    ],
    CATEGORY_NAMES: ['Shot Settings', 'Scene Settings', 'Cinematography', 'Visual Details', 'Motion Description', 'Audio Settings', 'Dialogue', 'Tags'],
    DIALOGUE_PRESETS: {
        accent: ['neutral', 'American', 'British', 'Australian', 'New Zealand'],
        language: ['English', 'Spanish', 'French', 'German', 'Italian'],
        emotion: ['Neutral', 'Happy', 'Sad', 'Angry', 'Seductive'],
        type: ['spoken', 'whispered', 'shouted', 'narration', 'sung']
    },
    STATUS_IDLE: 'idle',
    STATUS_GENERATING: 'generating',
    STATUS_MODERATED: 'moderated',
    STATUS_RETRYING: 'retrying',
    STATUS_COMPLETED: 'completed',
    STATUS_FAILED: 'failed',
    ASPECT_RATIOS: ['portrait', 'landscape', 'square'],
    SAVED_PROMPT_SLOTS: 3,
    RAW_TEMPLATE_FIELDS: [
        { value: 'shot.motion_level', label: 'Shot • Motion Level', type: 'scalar' },
        { value: 'shot.camera_depth', label: 'Shot • Camera Depth', type: 'scalar' },
        { value: 'shot.camera_view', label: 'Shot • Camera View', type: 'scalar' },
        { value: 'shot.camera_movement', label: 'Shot • Camera Movement', type: 'scalar' },
        { value: 'scene.location', label: 'Scene • Location', type: 'scalar' },
        { value: 'scene.environment', label: 'Scene • Environment', type: 'scalar' },
        { value: 'cinematography.lighting', label: 'Cinematography • Lighting', type: 'scalar' },
        { value: 'cinematography.style', label: 'Cinematography • Style', type: 'scalar' },
        { value: 'cinematography.texture', label: 'Cinematography • Texture', type: 'scalar' },
        { value: 'cinematography.depth_of_field', label: 'Cinematography • Depth of Field', type: 'scalar' },
        { value: 'visual_details.objects[]', label: 'Visual Details • Objects (array)', type: 'array' },
        { value: 'visual_details.positioning', label: 'Visual Details • Positioning', type: 'scalar' },
        { value: 'visual_details.text_elements', label: 'Visual Details • Text Elements', type: 'scalar' },
        { value: 'motion', label: 'Motion Description', type: 'scalar' },
        { value: 'audio.music', label: 'Audio • Music', type: 'scalar' },
        { value: 'audio.ambient', label: 'Audio • Ambient', type: 'scalar' },
        { value: 'audio.sound_effect', label: 'Audio • Sound Effect', type: 'scalar' },
        { value: 'audio.mix_level', label: 'Audio • Mix Level', type: 'scalar' },
        { value: 'dialogue[]', label: 'Dialogue (array)', type: 'array' },
        { value: 'tags[]', label: 'Tags (array)', type: 'array' }
    ]
};
