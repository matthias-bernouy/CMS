export type ImageDimensions = {
    height: number;
    width: number;
};

export type ProbedImage = ImageDimensions & {
    extension: string;
    mimeType: string;
};
