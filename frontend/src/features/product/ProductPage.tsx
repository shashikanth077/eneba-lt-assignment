import { useParams } from 'react-router-dom';
import { PagePlaceholder } from '../../components/layout/PagePlaceholder';

/** Placeholder: the suggestions in the search box link here as /product/<slug>. */
export function ProductPage() {
  const { slug } = useParams();

  return <PagePlaceholder title={`Product: ${slug ?? ''}`} />;
}
