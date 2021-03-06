import j, { ASTPath, ASTNode, Collection } from 'jscodeshift'
import t from 'ast-types'
import * as recast from 'recast'
import mapValues from './util/mapValues'
import isEmpty from './util/isEmpty'

export type Match<Node extends ASTNode> = {
  path: ASTPath<Node>
  node: Node
  pathCaptures?: Record<string, ASTPath<any>>
  captures?: Record<string, ASTNode>
}

const ignoredFields = new Set([
  'loc',
  'leadingComments',
  'trailingComments',
  'innerComments',
])

function isCompatibleType(path: ASTPath<any>, query: ASTNode): boolean {
  if (t.namedTypes.Function.check(query)) {
    return t.namedTypes.Function.check(path.node)
  }
  return false
}

function matchAgainstQuery<Node extends ASTNode>(
  path: ASTPath<any>,
  query: Node
): Match<Node> | void {
  const captures: Record<string, ASTPath<any>> = {}
  function helper(path: ASTPath<any>, query: ASTNode | ASTNode[]): boolean {
    if (Array.isArray(query)) {
      if (!Array.isArray(path.value)) return false
      if (path.value.length !== query.length) return false
      for (let i = 0; i < query.length; i++) {
        if (!helper(path.get(i), query[i])) return false
      }
      return true
    } else if (query.type === 'Identifier') {
      const captureMatch = /^\$([a-z0-9]+)/i.exec(query.name)
      if (captureMatch) {
        captures[captureMatch[1]] = path
        return true
      } else {
        return (
          path.node?.type === 'Identifier' &&
          path.node.name === query.name.replace(/^\$\$/g, '$')
        )
      }
    } else if (
      path.node?.type === query.type ||
      isCompatibleType(path, query)
    ) {
      for (const key in query) {
        if (ignoredFields.has(key)) continue
        const value = (query as any)[key]
        if (
          typeof value !== 'object' ||
          value == null ||
          (!Array.isArray(value) && !value.hasOwnProperty('type'))
        ) {
          continue
        }
        if (!helper(path.get(key), value)) return false
      }
      return true
    } else {
      return false
    }
  }
  if (helper(path, query)) {
    const match: Match<Node> = { path, node: path.node }
    if (!isEmpty(captures)) {
      match.pathCaptures = captures
      match.captures = mapValues(captures, path => path.node)
    }
    return match
  }
}

function getNodeType(query: ASTNode): recast.Type<any> {
  switch (query.type) {
    case 'FunctionDeclaration':
    case 'FunctionExpression':
      return j.Function
    default:
      return j[query.type] as any
  }
}

export default function find<Node extends ASTNode>(
  root: Collection,
  query: Node
): Array<Match<Node>> {
  const nodeType = getNodeType(query)

  const matches: Array<Match<Node>> = []

  root.find(nodeType).forEach((path: ASTPath<any>) => {
    const match = matchAgainstQuery(path, query)
    if (match) matches.push(match)
  })

  return matches
}
