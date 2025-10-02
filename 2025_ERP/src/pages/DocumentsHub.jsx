import React from 'react';
import { useSearchParams } from 'react-router-dom';
import EntityDocuments from '@/components/documents/EntityDocuments.jsx';

export default function DocumentsHub() {
  const [params] = useSearchParams();
  const entityType = params.get('entityType') || '';
  const entityIdStr = params.get('entityId') || '';
  const entityId = Number(entityIdStr);
  const category = params.get('category') || '';
  const title = params.get('title') || 'Documents';

  if (!entityType || !Number.isFinite(entityId)) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold mb-2">Documents</h1>
        <p className="text-sm text-slate-600">Provide query parameters: entityType and entityId.</p>
        <pre className="mt-2 rounded bg-slate-100 p-2 text-xs">/documents?entityType=project&entityId=123</pre>
      </div>
    );
  }

  return (
    <div className="p-4">
      <EntityDocuments entityType={entityType} entityId={entityId} title={title} />
    </div>
  );
}

