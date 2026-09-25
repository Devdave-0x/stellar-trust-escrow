import { uploadReducer, type UploadState } from '../lib/evidenceUpload';

jest.mock('../lib/api', () => ({ api: { post: jest.fn(), get: jest.fn() } }));

const idle: UploadState = { phase: 'idle' };

describe('evidence upload state', () => {
  it('reports progress as a percentage and never goes backwards', () => {
    let s = uploadReducer(idle, { type: 'start' });
    s = uploadReducer(s, { type: 'progress', loaded: 50, total: 200 });
    expect(s).toEqual({ phase: 'uploading', progress: 25 });
    s = uploadReducer(s, { type: 'progress', loaded: 10, total: 200 });
    expect(s).toEqual({ phase: 'uploading', progress: 25 });
  });

  it('moves through scanning to the final scan state', () => {
    let s = uploadReducer({ phase: 'uploading', progress: 100 }, { type: 'uploaded', evidenceId: 7, scanStatus: 'pending' });
    expect(s).toEqual({ phase: 'scanning', evidenceId: 7 });
    s = uploadReducer(s, { type: 'scanned', scanStatus: 'infected' });
    expect(s).toEqual({ phase: 'done', evidenceId: 7, scanStatus: 'infected' });
  });

  it('fails with a reason and restarts cleanly on retry', () => {
    const failed = uploadReducer({ phase: 'uploading', progress: 40 }, { type: 'failed', error: 'Network Error' });
    expect(failed).toEqual({ phase: 'failed', error: 'Network Error' });
    expect(uploadReducer(failed, { type: 'start' })).toEqual({ phase: 'uploading', progress: 0 });
  });
});
