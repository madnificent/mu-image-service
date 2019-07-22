import { app, query, update, errorHandler, sparqlEscapeString, sparqlEscapeUri, uuid } from 'mu';
import sharp from 'sharp';
import fs from 'fs';

const IMAGES_FOLDER = "/share/derivedImages/";

const PREFIXES = `
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
  PREFIX dct: <http://purl.org/dc/terms/>
`;

// Ensure our images folder exists
if (!fs.existsSync(IMAGES_FOLDER)){
    fs.mkdirSync(IMAGES_FOLDER);
}

/**
 * Yields an image with the desired size
 *
 * id: the UUID of the original image
 * ?width: the desired width
 * ?height: the desired height
 */
app.get('/image/:id', async function( req, res ) {
  const info = await getRawImageInfo( req.params.id );
  if( ! info ) {
    res.send("File not found", 404);
    return;
  }

  res.type( info.format );

  let { width, height } = req.query;
  width = width ? parseInt(width) : null;
  height = height ? parseInt(height) : null;

  const imageInformation = {
    width, height, source: info
  };

  let existingImageStream = await findImageStream( imageInformation );
  if( existingImageStream ) {
    existingImageStream.pipe( res );
  } else {
    const source = createResizedImageStream( imageInformation );
    cacheFile( source, imageInformation );
    source.pipe( res );
  }
});

app.use(errorHandler);

async function cacheFile( stream, { width, height, source } ){
    const pathUuid = uuid();
    const imageExtPath = `share://derivedImages/${pathUuid}`;
    const imageFilePath = `/share/derivedImages/${pathUuid}`;
    const fileWriteStream = fs.createWriteStream(imageFilePath);
    stream.pipe( fileWriteStream );
    fileWriteStream.on('close', async function() {

      const imageFdoUuid = uuid();
      const imageFdoUri = `http://mu.semte.ch/services/image-service/${imageFdoUuid}`;

      const insertQuery = `
        ${PREFIXES}

        INSERT DATA {
          GRAPH <http://mu.semte.ch/application> {
            ${sparqlEscapeUri( source.originalFileUri )}
              ext:hasDerivedImage ${sparqlEscapeUri( imageFdoUri )}.
            ${sparqlEscapeUri( imageFdoUri )}
              a nfo:FileDataObject;
              dct:format ${sparqlEscapeString( source.format )};
              mu:uuid ${sparqlEscapeString( imageFdoUuid )}.
            ${width ? `${sparqlEscapeUri( imageFdoUri )} ext:imageWidth ${sparqlEscapeString( width + '' )}.` : '' }
            ${height ? `${sparqlEscapeUri( imageFdoUri )} ext:imageHeight ${sparqlEscapeString( height + '' )}.` : '' }
            ${sparqlEscapeUri( imageExtPath )}
              mu:uuid ${sparqlEscapeString( pathUuid )};
              nie:dataSource ${sparqlEscapeUri( imageFdoUri )}.
          }
        }`;

      const response = await update( insertQuery );
      console.log( response );
      // write file information to the database
    } );
}

async function findImageStream( { width, height, source } ) {
  const searchQuery = `
        ${PREFIXES}

        SELECT * WHERE {
          GRAPH <http://mu.semte.ch/application> {
            ${sparqlEscapeUri( source.originalFileUri )}
              ext:hasDerivedImage ?derivedImage.
            ?derivedImage a nfo:FileDataObject.
            ${width ? `?derivedImage ext:imageWidth ${sparqlEscapeString( width + '' )}.` : '' }
            ${height ? `?derivedImage ext:imageHeight ${sparqlEscapeString( height + '' )}.` : '' }
            ?datasource nie:dataSource ?derivedImage.
          }
        }`;
  const response = await query( searchQuery );

  if( response.results.bindings.length >= 1 ) {
    const { datasource: { value: datasource } } = response.results.bindings[0];

    if( datasource.indexOf( "share://" ) === 0 ) {
      const relativePath = datasource.slice( "share://".length );
      const path = `/share/${relativePath}`;
      return fs.createReadStream(path);
    } else {
      throw "Could not find image";
    }
  } else {
    return false;
  }
}

function createResizedImageStream( { width, height, source } ) {
  const readStream = fs.createReadStream( source.path );

  const transform = sharp();
  transform.resize( width, height );

  return readStream.pipe( transform );
}

async function getRawImageInfo( id ) {
  const res = await query(`
    ${PREFIXES}
    
    SELECT * WHERE {
      GRAPH <http://mu.semte.ch/application> {
        ?fdo mu:uuid ${sparqlEscapeString( id )};
             a nfo:FileDataObject;
             dct:format ?format.
        ?datasource nie:dataSource ?fdo.
      }
    }`);

  if( res.results.bindings.length > 0 ) {
    const { datasource: { value: datasource },
            fdo: { value: originalFileUri },
            format: { value: format } }
          = res.results.bindings[0];
    if( datasource.indexOf( "share://" ) === 0 ) {
      const relativePath = datasource.slice( "share://".length );
      return {
        format,
        originalFileUri,
        path: `/share/${relativePath}`
      };
    } else {
      throw "File location not found";
    }
  } else {
    return null;
  }
}
