import { sendMessagePromise } from "./chrome";
import { encodeToBase64 } from "./data";

export const info = async () => {
  const response = await sendMessagePromise("NATIVE_INFO", {});
  return response;
};

export const initialize = async (params: InitializeParams) => {
  const response = await sendMessagePromise("NATIVE_INITIALIZE", params);
  return response;
};

export const hover = async (
  path,
  sha,
  line,
  character
): Promise<HoverResult> => {
  const data = { path, sha, line, character };
  const response = await sendMessagePromise("NATIVE_HOVER", data);
  // Translate LSP response to what our app expects
  const { result } = response;

  if (!!result) {
    const { contents } = result;
    return {
      signature: contents[0].value,
      name: "name", // TODO: get name, maybe via definition call
      language: contents[0].language,
      docstring: encodeToBase64(contents[2])
    };
  }
};

const getItems = async (locations: Location[]) => {
  const itemPromises: Promise<ResultItem>[] = locations.map(
    async ({ path, range }): Promise<ResultItem> => {
      const { contents } = await sendMessagePromise("NATIVE_FILE_CONTENTS", {
        path
      });
      return {
        codeSnippet: encodeToBase64(contents),
        lineNumber: range.start.line,
        startLineNumber: 0
      };
    }
  );
  return await Promise.all(itemPromises);
};

export const definition = async (
  path,
  sha,
  line,
  character
): Promise<DefinitionResult> => {
  const data = { path, sha, line, character };
  const hover = await sendMessagePromise("NATIVE_HOVER", data);
  const definition = await sendMessagePromise("NATIVE_DEFINITION", data);
  const items = await getItems(definition.result);

  return {
    name: "name",
    filePath: definition.result[0].path,
    fileSha: sha,
    docstring: encodeToBase64(hover.result.contents[2]),
    items
  };
};

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

export const references = async (
  path,
  sha,
  line,
  character
): Promise<UsageItem[]> => {
  const data = { path, sha, line, character };
  const references = await sendMessagePromise("NATIVE_REFERENCES", data);
  const locations = <Location[]>references.result;
  const uniquePaths = [...new Set(locations.map(location => location.path))];
  const pathWiseItems = {};

  await asyncForEach(uniquePaths, async currentPath => {
    pathWiseItems[currentPath] = await getItems(
      locations.filter(({ path }) => path === currentPath)
    );
  });
  return uniquePaths.map(currentPath => ({
    filePath: currentPath,
    fileSha: sha,
    items: pathWiseItems[currentPath]
  }));
};

export const contents = async (path, sha): Promise<string> => {
  // TODO: also use sha here
  const response = await sendMessagePromise("NATIVE_FILE_CONTENTS", { path });
  return encodeToBase64(response.contents);
};
