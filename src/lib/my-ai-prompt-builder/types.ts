/**
 * Mini Prompt Builder — types for the Customize AI appearance form.
 *
 * Each field is a string key selected from a fixed dropdown of options.
 * The builder converts these into a single deterministic prompt string.
 * No LLM, no external API — pure field-to-text mapping + template.
 */

export interface MyAiAppearance {
  age: string;
  ethnicity: string;
  skin_tone: string;
  hair_style: string;
  hair_color: string;
  eye_color: string;
  face_shape: string;
  body_type: string;
  body_shape: string;
  breast_shape: string;
  breast_size: string;
}

export function createEmptyAppearance(): MyAiAppearance {
  return {
    age: '',
    ethnicity: '',
    skin_tone: '',
    hair_style: '',
    hair_color: '',
    eye_color: '',
    face_shape: '',
    body_type: '',
    body_shape: '',
    breast_shape: '',
    breast_size: '',
  };
}

export const APPEARANCE_FIELD_OPTIONS: Record<keyof MyAiAppearance, string[]> = {
  age: ['18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'],
  ethnicity: ['White / European', 'Japanese', 'South Korean', 'Indian', 'Southeast Asian', 'Central Asian', 'Middle Eastern', 'Sub-Saharan African', 'Latin American'],
  skin_tone: ['Very Fair', 'Fair', 'Light', 'Light-Medium', 'Medium', 'Tan', 'Medium-Brown', 'Brown', 'Deep Brown', 'Very Deep'],
  hair_style: ['Long straight', 'Long wavy', 'Long curly', 'Medium straight', 'Medium wavy', 'Short straight', 'Short curly', 'Bob cut', 'Ponytail', 'Braids'],
  hair_color: ['Blonde', 'Brunette', 'Black', 'Red', 'Auburn', 'Platinum'],
  eye_color: ['Blue', 'Brown', 'Green', 'Hazel', 'Grey', 'Amber'],
  face_shape: ['Oval', 'Round', 'Square', 'Heart', 'Diamond', 'Oblong'],
  body_type: ['Slim', 'Athletic', 'Curvy', 'Plus-size'],
  body_shape: ['Hourglass', 'Pear', 'Athletic', 'Rectangle', 'Inverted triangle'],
  breast_shape: ['Round', 'Teardrop', 'Bell', 'East-west', 'Asymmetric'],
  breast_size: ['Small', 'Medium', 'Large', 'Extra large'],
};

export const APPEARANCE_FIELD_LABELS: Record<keyof MyAiAppearance, string> = {
  age: 'Age',
  ethnicity: 'Ethnicity',
  skin_tone: 'Skin Tone',
  hair_style: 'Hair Style',
  hair_color: 'Hair Colour',
  eye_color: 'Eye Colour',
  face_shape: 'Face Shape',
  body_type: 'Body Type',
  body_shape: 'Body Shape',
  breast_shape: 'Breast Shape',
  breast_size: 'Breast Size',
};
