import { defineCollection, z } from "astro:content";

const projects = defineCollection({
  schema: z.object({
    title: z.string(),
    description: z.string(),
    tech: z.array(z.string()),
    image: z.string().optional(),
    github: z.string().optional(),
    featured: z.boolean().default(false), 
    importance: z.number().default(999),  
  }),
});

export const collections = {
  projects,
};
