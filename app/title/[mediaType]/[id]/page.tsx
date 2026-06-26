import TitleDetailPage from '@/components/TitleDetailPage';
import { fetchTitleDetails } from '@/lib/tmdb-title';

type PageProps = {
  params: Promise<{
    mediaType: 'movie' | 'tv';
    id: string;
  }>;
};

export default async function Page({ params }: PageProps) {
  const { mediaType, id } = await params;
  let initialData = null;

  try {
    initialData = await fetchTitleDetails(mediaType, id);
  } catch (error) {
    console.error('Failed to fetch title details for page render:', error);
  }

  return (
    <TitleDetailPage
      mediaType={mediaType}
      id={id}
      initialData={initialData}
    />
  );
}
